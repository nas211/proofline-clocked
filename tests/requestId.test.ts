import { describe, expect, it } from 'vitest';
import { chooseRequestId, newRequestId } from '../src/lib/requestId';
import { isUuid } from '../src/shared/limits';
import { buildExport, buildPlainSummary } from '../src/lib/exportResults';
import type { AnalysisResult } from '../src/shared/types';

const PREV = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b';
let counter = 0;
const mint = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

describe('client request ids (duplicate / retry handling)', () => {
    it('mints valid v4 UUIDs', () => {
        expect(isUuid(newRequestId())).toBe(true);
        expect(newRequestId()).not.toBe(newRequestId());
    });

    it('reuses the same id when retrying the same text after an unknown outcome', () => {
        const r = chooseRequestId('doc', { text: 'doc', requestId: PREV, retryable: true }, mint);
        expect(r).toEqual({ requestId: PREV, isRetry: true });
    });

    it('mints a new id when the text changed (new payload => new logical request)', () => {
        expect(chooseRequestId('doc v2', { text: 'doc', requestId: PREV, retryable: true }, mint).requestId).not.toBe(PREV);
    });

    it('mints a new id after a definitive outcome', () => {
        expect(chooseRequestId('doc', { text: 'doc', requestId: PREV, retryable: false }, mint).requestId).not.toBe(PREV);
        expect(chooseRequestId('doc', null, mint).isRetry).toBe(false);
    });
});

describe('exports', () => {
    const result: AnalysisResult = {
        requestId: PREV,
        status: 'partial',
        classification: { choice: 'invoice', confidence: 0.5, probabilities: {}, schema: 'general', reviewRequired: true, reviewReason: 'uncertain' },
        fields: [
            { key: 'dates', label: 'Dates', list: true, status: 'not_found', items: [], confidence: null, reviewSuggested: false },
            {
                key: 'amounts',
                label: 'Amounts',
                list: true,
                status: 'found',
                items: [{ value: '€2,480.00', start: 3, end: 12, confidence: 0.4, located: false }],
                confidence: 0.4,
                reviewSuggested: true,
            },
        ],
        draft: null,
        warnings: ['uncertain', 'Partial result: the AI draft could not be generated.'],
        stages: { decide: 'ok', extract: 'ok', fill: 'failed' },
    };

    it('plain summary marks Not found, review, unavailable locations and partial status', () => {
        const s = buildPlainSummary(result);
        expect(s).toContain('Dates: Not found');
        expect(s).toContain('[Review suggested]');
        expect(s).toContain('source location unavailable');
        expect(s).toContain('PARTIAL RESULT');
        expect(s).not.toMatch(/guarantee(d)? correct/i);
    });

    it('JSON export contains the source and actual structured result including warnings', () => {
        const e = buildExport(result, 'original\ntext 💶');
        expect(e.source).toBe('original\ntext 💶');
        expect(e.result.warnings).toHaveLength(2);
        expect(e.result.status).toBe('partial');
    });
});

