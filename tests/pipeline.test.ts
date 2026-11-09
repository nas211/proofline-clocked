import { describe, expect, it } from 'vitest';
import { StageError, runAnalysis } from '../netlify/lib/clocked';
import { deriveIdempotencyKey } from '../src/shared/idempotency';
import { isUuid } from '../src/shared/limits';
import { SCHEMAS, routeSchema } from '../src/shared/schemas';
import { SAMPLES } from '../src/lib/samples';
import { cpSpan, decideReply, fillReply, mockClocked, type Reply } from './helpers';

const RID = '0b9d6f4a-7c1e-4f3b-9a2d-5e8c7b6a4f31';
const KEY = 'test-key-not-real';
const invoice = SAMPLES.find((s) => s.id === 'invoice')!.text;

const invoiceExtract: Reply = {
    body: {
        fields: {
            reference: { ...cpSpan(invoice, 'PL-2026-0417'), confidence: 0.97 },
            issuer: { ...cpSpan(invoice, 'Maren Okafor Design Studio'), confidence: 0.95 },
            recipient: { ...cpSpan(invoice, 'Lumen & Pike Ltd'), confidence: 0.94 },
            total: { ...cpSpan(invoice, '€2,480.00'), confidence: 0.81 },
            due_date: { ...cpSpan(invoice, '30 November 2026'), confidence: 0.93 },
            payment_terms: { value: null, start: null, end: null, confidence: 0.5 },
        },
    },
};

describe('schema routing', () => {
    it.each([
        ['invoice', 0.9, 'invoice', false],
        ['agreement', 0.65, 'agreement', false],
        ['notes', 0.99, 'notes', false],
        ['invoice', 0.64, 'general', true],
        ['other', 0.95, 'general', true],
        ['receipt', 0.95, 'general', true],
        ['invoice', null, 'general', true],
    ])('%s @ %s => %s (review %s)', (choice, conf, schema, review) => {
        const r = routeSchema(choice, conf);
        expect(r.schema).toBe(schema);
        expect(r.reviewRequired).toBe(review);
    });

    it('sends the routed schema fields to /extract', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: decideReply('agreement', 0.9), extract: { body: { fields: {} } }, fill: fillReply });
        await runAnalysis('Agreement text', { apiKey: KEY, requestId: RID, fetchImpl });
        const extract = calls.find((c) => c.endpoint === 'extract')!;
        expect(Object.keys(extract.body.fields as object)).toEqual(Object.keys(SCHEMAS.agreement));
        expect((extract.body.fields as Record<string, Record<string, unknown>>).parties).toMatchObject({ list: true, max_items: 4 });
    });

    it('uncertain classification uses general fields and a visible review warning', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: decideReply('invoice', 0.5), extract: { body: { fields: {} } }, fill: fillReply });
        const result = await runAnalysis('ambiguous', { apiKey: KEY, requestId: RID, fetchImpl });
        expect(result.classification.schema).toBe('general');
        expect(result.classification.reviewRequired).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(Object.keys(calls.find((c) => c.endpoint === 'extract')!.body.fields as object)).toEqual(['names', 'dates', 'amounts', 'action_items']);
    });
});

describe('full pipeline', () => {
    it('returns verified evidence, Not found for nulls, and a labelled AI draft', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: decideReply('invoice', 0.92), extract: invoiceExtract, fill: fillReply });
        const r = await runAnalysis(invoice, { apiKey: KEY, requestId: RID, fetchImpl });
        expect(r.status).toBe('complete');
        expect(r.fields.find((f) => f.key === 'total')!.items[0]).toMatchObject({ value: '€2,480.00', located: true });
        expect(r.fields.find((f) => f.key === 'payment_terms')!.status).toBe('not_found');
        expect(r.draft?.label).toBe('AI draft — review before use');
        // exact request payloads
        const decide = calls.find((c) => c.endpoint === 'decide')!;
        expect(decide.body.state).toBe(invoice);
        expect(decide.url).toBe('https://clocked.rezolve.ai/clocked/decide');
        expect(calls.find((c) => c.endpoint === 'extract')!.body.text).toBe(invoice);
        expect(calls.find((c) => c.endpoint === 'fill')!.body.fields).toHaveProperty('next_step.max_tokens', 70);
    });

    it('sends Bearer auth and JSON content type on every stage', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: decideReply('invoice', 0.92), extract: invoiceExtract, fill: fillReply });
        await runAnalysis(invoice, { apiKey: KEY, requestId: RID, fetchImpl });
        expect(calls).toHaveLength(3);
        for (const c of calls) {
            expect(c.headers.Authorization).toBe(`Bearer ${KEY}`);
            expect(c.headers['Content-Type']).toBe('application/json');
        }
    });
});

describe('failed and partial upstream results', () => {
    it('decide failure aborts — no pretend classification, no further calls', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: { status: 500 } });
        await expect(runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl })).rejects.toMatchObject({ stage: 'decide', retryable: true });
        expect(calls.map((c) => c.endpoint)).toEqual(['decide']);
    });

    it('malformed decide response is an error, not a guess', async () => {
        const { fetchImpl } = mockClocked({ decide: { body: { answers: {} } } });
        await expect(runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl })).rejects.toMatchObject({ stage: 'decide', code: 'malformed' });
    });

    it('fill failure keeps extracted evidence with a partial warning', async () => {
        const { fetchImpl } = mockClocked({ decide: decideReply('invoice', 0.92), extract: invoiceExtract, fill: { status: 503 } });
        const r = await runAnalysis(invoice, { apiKey: KEY, requestId: RID, fetchImpl });
        expect(r.status).toBe('partial');
        expect(r.draft).toBeNull();
        expect(r.stages.fill).toBe('failed');
        expect(r.fields.find((f) => f.key === 'reference')!.items[0].located).toBe(true);
        expect(r.warnings.some((w) => w.startsWith('Partial result'))).toBe(true);
    });

    it('empty fill output is also partial', async () => {
        const { fetchImpl } = mockClocked({ decide: decideReply('invoice', 0.92), extract: invoiceExtract, fill: { body: { fields: { next_step: { value: '' } } } } });
        expect((await runAnalysis(invoice, { apiKey: KEY, requestId: RID, fetchImpl })).status).toBe('partial');
    });

    it('extract failure is an error', async () => {
        const { fetchImpl } = mockClocked({ decide: decideReply('invoice', 0.92), extract: { status: 422 }, fill: fillReply });
        await expect(runAnalysis(invoice, { apiKey: KEY, requestId: RID, fetchImpl })).rejects.toMatchObject({ stage: 'extract', retryable: false });
    });

    it('unreadable JSON body becomes a safe error', async () => {
        const { fetchImpl } = mockClocked({ decide: { raw: '<html>oops</html>' } });
        await expect(runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl })).rejects.toMatchObject({ code: 'malformed' });
    });

    it.each([
        [401, 'upstream_auth', false],
        [403, 'upstream_auth', false],
        [409, 'idempotency_conflict', false],
        [429, 'upstream_busy', true],
        [502, 'upstream_unavailable', true],
    ])('maps upstream %s safely', async (status, code, retryable) => {
        const { fetchImpl } = mockClocked({ decide: { status } });
        const err = await runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl }).catch((e) => e);
        expect(err).toBeInstanceOf(StageError);
        expect(err).toMatchObject({ code, retryable });
        expect(String(err.message)).not.toContain('should-never-leak');
        expect(String(err.message)).not.toContain(KEY);
    });

    it('network failure is retryable', async () => {
        const { fetchImpl } = mockClocked({ decide: { throws: true } });
        await expect(runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl })).rejects.toMatchObject({ code: 'network', retryable: true });
    });

    it('times out within the budget', async () => {
        const { fetchImpl } = mockClocked({ decide: { hang: true } });
        await expect(runAnalysis('x', { apiKey: KEY, requestId: RID, fetchImpl, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout', status: 504 });
    });
});

describe('idempotency keys', () => {
    it('are UUIDs, distinct per endpoint, and stable per logical request', async () => {
        const run = async (rid: string) => {
            const { fetchImpl, calls } = mockClocked({ decide: decideReply('invoice', 0.92), extract: invoiceExtract, fill: fillReply });
            await runAnalysis(invoice, { apiKey: KEY, requestId: rid, fetchImpl });
            return Object.fromEntries(calls.map((c) => [c.endpoint, c.headers['Idempotency-Key']]));
        };
        const first = await run(RID);
        const retry = await run(RID);
        const other = await run('7a1c2d3e-4f50-4a6b-8c7d-8e9f0a1b2c3d');

        expect(Object.values(first).every(isUuid)).toBe(true);
        expect(new Set(Object.values(first)).size).toBe(3);
        expect(retry).toEqual(first); // retry of the same logical request reuses the same keys
        for (const ep of ['decide', 'extract', 'fill']) expect(other[ep]).not.toBe(first[ep]);
    });

    it('derivation is case-insensitive on the request id', async () => {
        expect(await deriveIdempotencyKey(RID.toUpperCase(), 'fill')).toBe(await deriveIdempotencyKey(RID, 'fill'));
    });

    it('never auto-retries: one call per endpoint even when it fails', async () => {
        const { fetchImpl, calls } = mockClocked({ decide: decideReply('notes', 0.9), extract: { status: 500 }, fill: { status: 500 } });
        await runAnalysis('notes', { apiKey: KEY, requestId: RID, fetchImpl }).catch(() => undefined);
        expect(calls.filter((c) => c.endpoint === 'extract')).toHaveLength(1);
        expect(calls.filter((c) => c.endpoint === 'fill')).toHaveLength(1);
    });
});

