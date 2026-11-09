/**
 * Server-only Clocked pipeline: /decide -> (/extract + /fill in parallel).
 * Never logs document text, API keys or upstream headers.
 */
import { deriveIdempotencyKey } from '../../src/shared/idempotency';
import { UPSTREAM_TIMEOUT_MS } from '../../src/shared/limits';
import {
    AI_DRAFT_LABEL,
    DECIDE_INSTRUCTIONS,
    DECIDE_QUESTIONS,
    EXTRACT_INSTRUCTIONS,
    FILL_FIELDS,
    FILL_INSTRUCTIONS,
    SCHEMAS,
    routeSchema,
    toClockedFields,
} from '../../src/shared/schemas';
import { normalizeField } from '../../src/shared/spans';
import type { AnalysisResult, Classification, DraftResult, Stage } from '../../src/shared/types';

export const CLOCKED_BASE_URL = 'https://clocked.rezolve.ai/clocked';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class StageError extends Error {
    constructor(
        public readonly stage: Stage,
        public readonly code: string,
        public readonly status: number,
        message: string,
        public readonly retryable: boolean,
    ) {
        super(message);
        this.name = 'StageError';
    }
}

export interface PipelineOptions {
    apiKey: string;
    requestId: string;
    fetchImpl?: FetchLike;
    baseUrl?: string;
    timeoutMs?: number;
}

const STAGE_NAMES: Record<Stage, string> = {
    decide: 'Classification',
    extract: 'Evidence extraction',
    fill: 'AI draft',
};

function mapUpstreamStatus(stage: Stage, status: number): StageError {
    const name = STAGE_NAMES[stage];
    if (status === 401 || status === 403) {
        return new StageError(stage, 'upstream_auth', 502, 'The analysis service rejected the server credentials. The site operator needs to check its configuration.', false);
    }
    if (status === 409) {
        return new StageError(stage, 'idempotency_conflict', 409, 'This request ID was already used with different content. Start a new analysis.', false);
    }
    if (status === 413) {
        return new StageError(stage, 'upstream_too_large', 413, 'The analysis service rejected the document as too large.', false);
    }
    if (status === 429) {
        return new StageError(stage, 'upstream_busy', 503, 'The analysis service is busy. Please retry shortly.', true);
    }
    if (status >= 500) {
        return new StageError(stage, 'upstream_unavailable', 502, `${name} is temporarily unavailable. Retrying is safe.`, true);
    }
    return new StageError(stage, 'upstream_rejected', 502, `${name} was rejected by the analysis service.`, false);
}

async function callClocked(
    stage: Stage,
    body: unknown,
    opts: Required<Pick<PipelineOptions, 'apiKey' | 'requestId' | 'baseUrl'>> & { fetchImpl: FetchLike },
    signal: AbortSignal,
): Promise<unknown> {
    const idempotencyKey = await deriveIdempotencyKey(opts.requestId, stage);
    let response: Response;
    try {
        response = await opts.fetchImpl(`${opts.baseUrl}/${stage}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify(body),
            signal,
        });
    } catch {
        if (signal.aborted) {
            throw new StageError(stage, 'timeout', 504, 'The analysis service did not finish within 50 seconds. Retrying is safe.', true);
        }
        throw new StageError(stage, 'network', 502, 'Could not reach the analysis service. Retrying is safe.', true);
    }

    if (!response.ok) throw mapUpstreamStatus(stage, response.status);

    try {
        return await response.json();
    } catch {
        if (signal.aborted) {
            throw new StageError(stage, 'timeout', 504, 'The analysis service did not finish within 50 seconds. Retrying is safe.', true);
        }
        throw new StageError(stage, 'malformed', 502, `${STAGE_NAMES[stage]} returned an unreadable response.`, true);
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseClassification(json: unknown): Classification {
    const answer = isRecord(json) && isRecord(json.answers) ? json.answers.document_type : undefined;
    if (!isRecord(answer) || typeof answer.choice !== 'string') {
        throw new StageError('decide', 'malformed', 502, 'Classification returned an unreadable response, so the document was not classified.', true);
    }
    const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) ? answer.confidence : null;
    const probabilities: Record<string, number> = {};
    if (isRecord(answer.probabilities)) {
        for (const [k, v] of Object.entries(answer.probabilities)) {
            if (typeof v === 'number' && Number.isFinite(v)) probabilities[k] = v;
        }
    }
    const route = routeSchema(answer.choice, confidence);
    return { choice: answer.choice, confidence, probabilities, ...route };
}

export function parseDraft(json: unknown): DraftResult | null {
    const fields = isRecord(json) && isRecord(json.fields) ? json.fields : null;
    if (!fields) return null;
    const read = (key: string): string | null => {
        const f = fields[key];
        const v = isRecord(f) ? f.value : undefined;
        return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    };
    const draft = { label: AI_DRAFT_LABEL, next_step: read('next_step'), missing_details: read('missing_details') };
    return draft.next_step === null && draft.missing_details === null ? null : draft;
}

export async function runAnalysis(text: string, options: PipelineOptions): Promise<AnalysisResult> {
    const opts = {
        apiKey: options.apiKey,
        requestId: options.requestId,
        baseUrl: options.baseUrl ?? CLOCKED_BASE_URL,
        fetchImpl: options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init)),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? UPSTREAM_TIMEOUT_MS);

    try {
        // Stage 1 — classify. Failure here aborts the analysis; we never guess a type.
        const decideJson = await callClocked(
            'decide',
            { state: text, instructions: DECIDE_INSTRUCTIONS, questions: DECIDE_QUESTIONS },
            opts,
            controller.signal,
        );
        const classification = parseClassification(decideJson);
        const schema = classification.schema;

        // Stages 2 + 3 — independent of each other, so run concurrently within the budget.
        const [extracted, filled] = await Promise.allSettled([
            callClocked('extract', { text, instructions: EXTRACT_INSTRUCTIONS, fields: toClockedFields(schema) }, opts, controller.signal),
            callClocked('fill', { text, instructions: FILL_INSTRUCTIONS, fields: FILL_FIELDS }, opts, controller.signal),
        ]);

        if (extracted.status === 'rejected') {
            if (extracted.reason instanceof StageError) throw extracted.reason;
            throw new StageError('extract', 'internal', 502, 'Evidence extraction failed.', true);
        }
        const extractJson = extracted.value;
        if (!isRecord(extractJson) || !isRecord(extractJson.fields)) {
            throw new StageError('extract', 'malformed', 502, 'Evidence extraction returned an unreadable response.', true);
        }
        const rawFields = extractJson.fields;
        const fields = Object.entries(SCHEMAS[schema]).map(([key, spec]) => normalizeField(text, key, spec, rawFields[key]));

        const warnings: string[] = [];
        if (classification.reviewRequired && classification.reviewReason) warnings.push(classification.reviewReason);

        let draft: DraftResult | null = null;
        let fillOk = false;
        if (filled.status === 'fulfilled') {
            draft = parseDraft(filled.value);
            fillOk = draft !== null;
            if (!fillOk) warnings.push('The AI draft came back empty or unreadable. The extracted evidence is still shown.');
        } else {
            const reason = filled.reason instanceof StageError ? filled.reason.message : 'AI draft failed.';
            warnings.push(`Partial result: the AI draft could not be generated (${reason}). The extracted evidence is still shown.`);
        }

        return {
            requestId: options.requestId,
            status: fillOk ? 'complete' : 'partial',
            classification,
            fields,
            draft,
            warnings,
            stages: { decide: 'ok', extract: 'ok', fill: fillOk ? 'ok' : 'failed' },
        };
    } finally {
        clearTimeout(timer);
    }
}

