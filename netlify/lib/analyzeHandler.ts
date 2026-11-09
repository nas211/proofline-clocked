/**
 * Request handling for POST /.netlify/functions/analyze.
 * Security posture: same-origin POST only, bounded body, server-side secret
 * from process.env.CLOCKED_API_KEY, no logging of document text or secrets,
 * no-store responses.
 */
import { MAX_REQUEST_BYTES, checkDocumentText, isUuid, utf8ByteLength } from '../../src/shared/limits';
import type { AnalysisErrorBody } from '../../src/shared/types';
import { StageError, runAnalysis, type FetchLike } from './clocked';

type Env = Record<string, string | undefined>;

function readEnv(): Env {
    const g = globalThis as { process?: { env?: Env } };
    return g.process?.env ?? {};
}

const BASE_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

function fail(status: number, code: string, message: string, retryable = false, extra: Record<string, string> = {}): Response {
    const body: AnalysisErrorBody = { error: { code, message, retryable } };
    return json(status, body, extra);
}

function originOf(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

export function isSameOrigin(req: Request, env: Env): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return false;
    const fetchSite = req.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin') return false;
    const allowed = new Set<string>();
    for (const candidate of [req.url, env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL]) {
        const o = originOf(candidate);
        if (o) allowed.add(o);
    }
    return allowed.has(origin);
}

export interface RateLimitOptions {
    perClient: number;
    global: number;
    windowMs: number;
}

/** Best-effort, per-instance sliding window. Bounds abuse of the server-side key on public demos. */
export function createRateLimiter(opts: RateLimitOptions, now: () => number = Date.now) {
    const hits = new Map<string, number[]>();
    let globalHits: number[] = [];
    return {
        hit(clientId: string): { allowed: boolean; retryAfterSec: number } {
            const t = now();
            const cutoff = t - opts.windowMs;
            globalHits = globalHits.filter((x) => x > cutoff);
            const mine = (hits.get(clientId) ?? []).filter((x) => x > cutoff);
            if (mine.length >= opts.perClient || globalHits.length >= opts.global) {
                const oldest = Math.min(mine[0] ?? t, globalHits[0] ?? t);
                hits.set(clientId, mine);
                return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - t) / 1000)) };
            }
            mine.push(t);
            globalHits.push(t);
            hits.set(clientId, mine);
            if (hits.size > 5000) hits.clear();
            return { allowed: true, retryAfterSec: 0 };
        },
    };
}

export interface HandlerDeps {
    fetchImpl?: FetchLike;
    rateLimit?: RateLimitOptions;
    timeoutMs?: number;
    now?: () => number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { perClient: 8, global: 60, windowMs: 10 * 60 * 1000 };

export function createAnalyzeHandler(deps: HandlerDeps = {}) {
    const limiter = createRateLimiter(deps.rateLimit ?? DEFAULT_RATE_LIMIT, deps.now);

    return async function analyze(req: Request): Promise<Response> {
        const env = readEnv();

        if (req.method !== 'POST') {
            return fail(405, 'method_not_allowed', 'Only POST is supported.', false, { Allow: 'POST' });
        }
        if (!isSameOrigin(req, env)) {
            return fail(403, 'forbidden_origin', 'Requests must come from the Proofline site itself.');
        }

        const apiKey = env.CLOCKED_API_KEY;
        if (!apiKey || apiKey.trim().length === 0) {
            return fail(503, 'not_configured', 'Analysis is not configured yet');
        }

        const contentType = req.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
            return fail(415, 'unsupported_media_type', 'Send the document as JSON.');
        }
        const declared = Number(req.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
            return fail(413, 'too_large', 'Request exceeds the 32 KB limit.');
        }

        let raw: string;
        try {
            raw = await req.text();
        } catch {
            return fail(400, 'bad_request', 'Could not read the request body.');
        }
        if (utf8ByteLength(raw) > MAX_REQUEST_BYTES) {
            return fail(413, 'too_large', 'Request exceeds the 32 KB limit.');
        }

        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return fail(400, 'bad_json', 'Request body is not valid JSON.');
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
            return fail(400, 'bad_request', 'Request body must be a JSON object.');
        }
        const { text, requestId } = body as { text?: unknown; requestId?: unknown };
        if (!isUuid(requestId)) {
            return fail(400, 'bad_request_id', 'A valid request UUID is required.');
        }
        const check = checkDocumentText(text);
        if (!check.ok) {
            return fail(check.code === 'too_long' ? 413 : 400, check.code, check.message);
        }

        const clientId = req.headers.get('x-nf-client-connection-ip') ?? 'unknown';
        const rate = limiter.hit(clientId);
        if (!rate.allowed) {
            return fail(429, 'rate_limited', 'Too many analyses from this connection. Please wait and try again.', true, {
                'Retry-After': String(rate.retryAfterSec),
            });
        }

        try {
            const result = await runAnalysis(text as string, {
                apiKey,
                requestId,
                fetchImpl: deps.fetchImpl,
                timeoutMs: deps.timeoutMs,
            });
            return json(200, result);
        } catch (err) {
            if (err instanceof StageError) {
                const body: AnalysisErrorBody = {
                    error: { code: err.code, message: err.message, retryable: err.retryable, stage: err.stage },
                };
                return json(err.status, body);
            }
            return fail(500, 'internal', 'Analysis failed unexpectedly. Retrying is safe.', true);
        }
    };
}

