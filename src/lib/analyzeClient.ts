import { ANALYZE_ENDPOINT, CLIENT_TIMEOUT_MS, buildRequestBody } from '@/shared/limits';
import type { AnalysisResult } from '@/shared/types';

export interface ClientError {
    code: string;
    message: string;
    /** Outcome unknown — retrying with the same request ID is safe. */
    retryable: boolean;
    status: number | null;
}

export type AnalyzeOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: ClientError };

function looksLikeResult(v: unknown): v is AnalysisResult {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Partial<AnalysisResult>;
    return typeof r.requestId === 'string' && Array.isArray(r.fields) && typeof r.classification === 'object' && Array.isArray(r.warnings);
}

/** Single POST — no automatic retries. */
export async function postAnalysis(text: string, requestId: string, outerSignal: AbortSignal): Promise<AnalyzeOutcome> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    outerSignal.addEventListener('abort', onAbort);
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, CLIENT_TIMEOUT_MS);

    try {
        let res: Response;
        try {
            res = await fetch(ANALYZE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: buildRequestBody(text, requestId),
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller.signal,
            });
        } catch {
            if (outerSignal.aborted) return { ok: false, error: { code: 'cancelled', message: 'Analysis cancelled.', retryable: false, status: null } };
            return {
                ok: false,
                error: timedOut
                    ? { code: 'timeout', message: 'The analysis took too long. Retrying is safe and reuses the same request.', retryable: true, status: null }
                    : { code: 'network', message: 'Could not reach the Proofline server. Check your connection and retry.', retryable: true, status: null },
            };
        }

        let body: unknown = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }

        if (res.ok && looksLikeResult(body)) return { ok: true, result: body };

        const err = (body as { error?: Partial<ClientError> } | null)?.error;
        if (err && typeof err.message === 'string') {
            return {
                ok: false,
                error: { code: String(err.code ?? 'error'), message: err.message, retryable: Boolean(err.retryable), status: res.status },
            };
        }
        if (res.status === 404) {
            return {
                ok: false,
                error: { code: 'no_endpoint', message: 'The analysis function is not available here. Run the app with Netlify (netlify dev or a deploy).', retryable: false, status: 404 },
            };
        }
        return {
            ok: false,
            error: { code: 'unexpected', message: 'The server returned an unexpected response.', retryable: res.status >= 500, status: res.status },
        };
    } finally {
        clearTimeout(timer);
        outerSignal.removeEventListener('abort', onAbort);
    }
}

