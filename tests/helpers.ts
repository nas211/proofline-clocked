import type { FetchLike } from '../netlify/lib/clocked';

export type Endpoint = 'decide' | 'extract' | 'fill';

export interface Reply {
    status?: number;
    body?: unknown;
    raw?: string;
    throws?: boolean;
    hang?: boolean;
}

export interface Call {
    endpoint: Endpoint;
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}

/** Fake Clocked upstream. Records every call; never retries on its own. */
export function mockClocked(replies: Partial<Record<Endpoint, Reply>>) {
    const calls: Call[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
        const endpoint = url.split('/').pop() as Endpoint;
        calls.push({
            endpoint,
            url,
            headers: init.headers as Record<string, string>,
            body: JSON.parse(String(init.body)),
        });
        const r = replies[endpoint] ?? { status: 500 };
        if (r.throws) throw new TypeError('fetch failed');
        if (r.hang) {
            return new Promise<Response>((_, reject) => {
                init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            });
        }
        return new Response(r.raw ?? JSON.stringify(r.body ?? {}), {
            status: r.status ?? 200,
            headers: { 'content-type': 'application/json', 'x-upstream-secret': 'should-never-leak' },
        });
    };
    return { fetchImpl, calls };
}

/** Code-point span of `needle` (first occurrence at or after `from` UTF-16 index). */
export function cpSpan(text: string, needle: string, from = 0) {
    const idx = text.indexOf(needle, from);
    if (idx < 0) throw new Error(`needle not found: ${needle}`);
    const start = Array.from(text.slice(0, idx)).length;
    return { value: needle, start, end: start + Array.from(needle).length };
}

export const decideReply = (choice: string, confidence: number): Reply => ({
    body: {
        answers: {
            document_type: {
                choice,
                confidence,
                probabilities: { invoice: 0.02, agreement: 0.02, notes: 0.02, other: 0.02, [choice]: confidence },
            },
        },
    },
});

export const fillReply: Reply = {
    body: {
        fields: {
            next_step: { value: 'Confirm the corrected total of €2,480.00 with the client before paying.' },
            missing_details: { value: 'Check which total is authoritative and whether the portal note is genuine.' },
        },
    },
};

