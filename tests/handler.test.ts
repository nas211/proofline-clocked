import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalyzeHandler } from '../netlify/lib/analyzeHandler';
import { MAX_CHARS } from '../src/shared/limits';
import { decideReply, fillReply, mockClocked } from './helpers';

const SITE = 'https://proofline.example.com';
const RID = 'c4a7e2b9-1d3f-4e5a-8b6c-7d8e9f0a1b2c';
const KEY = 'sk-test-not-real-0000';
const DOC = 'Invoice INV-1\n💶 Total: €100.00';

interface ReqOpts {
    origin?: string | null;
    method?: string;
    contentType?: string;
    raw?: string;
    fetchSite?: string;
}

function request(body: unknown, opts: ReqOpts = {}) {
    const headers = new Headers();
    if (opts.origin !== null) headers.set('origin', opts.origin ?? SITE);
    if (opts.fetchSite) headers.set('sec-fetch-site', opts.fetchSite);
    headers.set('content-type', opts.contentType ?? 'application/json');
    headers.set('x-nf-client-connection-ip', '203.0.113.7');
    const method = opts.method ?? 'POST';
    return new Request(`${SITE}/.netlify/functions/analyze`, {
        method,
        headers,
        body: method === 'GET' ? undefined : (opts.raw ?? JSON.stringify(body)),
    });
}

const okUpstream = () =>
    mockClocked({ decide: decideReply('invoice', 0.9), extract: { body: { fields: {} } }, fill: fillReply });

describe('analyze function', () => {
    const spies: ReturnType<typeof vi.spyOn>[] = [];

    beforeEach(() => {
        process.env.CLOCKED_API_KEY = KEY;
        for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => {}));
    });

    afterEach(() => {
        // Nothing — not the key, not the document — may ever be logged.
        for (const s of spies) expect(s).not.toHaveBeenCalled();
        spies.splice(0).forEach((s) => s.mockRestore());
        delete process.env.CLOCKED_API_KEY;
    });

    it('returns 503 "Analysis is not configured yet" when the key is absent — no fake success', async () => {
        delete process.env.CLOCKED_API_KEY;
        const { fetchImpl, calls } = okUpstream();
        const res = await createAnalyzeHandler({ fetchImpl })(request({ text: DOC, requestId: RID }));
        expect(res.status).toBe(503);
        expect((await res.json()).error.message).toBe('Analysis is not configured yet');
        expect(calls).toHaveLength(0);
    });

    it('only accepts POST', async () => {
        const res = await createAnalyzeHandler()(request(null, { method: 'GET' }));
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST');
    });

    it.each([
        ['missing Origin', { origin: null }],
        ['foreign Origin', { origin: 'https://evil.example.net' }],
        ['cross-site fetch metadata', { fetchSite: 'cross-site' }],
    ])('rejects %s', async (_l, opts) => {
        const res = await createAnalyzeHandler()(request({ text: DOC, requestId: RID }, opts as ReqOpts));
        expect(res.status).toBe(403);
    });

    it('requires JSON content type', async () => {
        const res = await createAnalyzeHandler()(request({ text: DOC, requestId: RID }, { contentType: 'text/plain' }));
        expect(res.status).toBe(415);
    });

    it('rejects bodies over 32KB', async () => {
        const res = await createAnalyzeHandler()(request({ text: '💶'.repeat(MAX_CHARS), requestId: RID }));
        expect(res.status).toBe(413);
    });

    it('rejects more than 12000 characters', async () => {
        const res = await createAnalyzeHandler()(request({ text: 'a'.repeat(MAX_CHARS + 1), requestId: RID }));
        expect(res.status).toBe(413);
    });

    it('rejects blank text, bad JSON and bad request ids', async () => {
        const h = createAnalyzeHandler();
        expect((await h(request({ text: '  \n ', requestId: RID }))).status).toBe(400);
        expect((await h(request(null, { raw: '{nope' }))).status).toBe(400);
        expect((await h(request({ text: DOC, requestId: 'abc' }))).status).toBe(400);
        expect((await h(request({ text: DOC }))).status).toBe(400);
    });

    it('accepts exactly 12000 characters and returns no-store results', async () => {
        const { fetchImpl, calls } = okUpstream();
        const res = await createAnalyzeHandler({ fetchImpl })(request({ text: 'a'.repeat(MAX_CHARS), requestId: RID }));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(calls).toHaveLength(3);
    });

    it('passes text through untrimmed and never echoes the API key', async () => {
        const { fetchImpl, calls } = okUpstream();
        const text = '  ' + DOC + '\n\n';
        const res = await createAnalyzeHandler({ fetchImpl })(request({ text, requestId: RID }));
        expect(calls[0].body.state).toBe(text);
        expect(await res.text()).not.toContain(KEY);
    });

    it('returns safe upstream errors without raw headers', async () => {
        const { fetchImpl } = mockClocked({ decide: { status: 401 } });
        const res = await createAnalyzeHandler({ fetchImpl })(request({ text: DOC, requestId: RID }));
        const body = await res.text();
        expect(res.status).toBe(502);
        expect(body).not.toContain('should-never-leak');
        expect(body).not.toContain(KEY);
        expect(body).not.toContain('Total');
        expect(JSON.parse(body).error).toMatchObject({ code: 'upstream_auth', stage: 'decide' });
    });

    it('rate-limits per connection', async () => {
        const { fetchImpl } = okUpstream();
        const h = createAnalyzeHandler({ fetchImpl, rateLimit: { perClient: 2, global: 100, windowMs: 60_000 } });
        expect((await h(request({ text: DOC, requestId: RID }))).status).toBe(200);
        expect((await h(request({ text: DOC, requestId: RID }))).status).toBe(200);
        const limited = await h(request({ text: DOC, requestId: RID }));
        expect(limited.status).toBe(429);
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    });
});

