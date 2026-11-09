import { describe, expect, it } from 'vitest';
import { isSpanValid, normalizeField, sliceCodePoints } from '../src/shared/spans';
import { SCHEMAS } from '../src/shared/schemas';
import { SAMPLES } from '../src/lib/samples';
import { cpSpan } from './helpers';

const TOTAL = SCHEMAS.invoice.total;
const PARTIES = SCHEMAS.agreement.parties;

describe('Unicode code-point offsets', () => {
    const text = '💶 Total: €2,480.00\n📅 Due: 30 Nov';

    it('slices by code points, so an emoji before the value counts as one', () => {
        expect(sliceCodePoints(text, 9, 18)).toBe('€2,480.00');
        expect(isSpanValid(text, '€2,480.00', 9, 18)).toBe(true);
        // UTF-16 offsets (shifted by the surrogate pair) must NOT validate.
        expect(text.indexOf('€')).toBe(10);
        expect(isSpanValid(text, '€2,480.00', 10, 19)).toBe(false);
    });

    it('locates values after later emoji and newlines', () => {
        const s = cpSpan(text, '30 Nov');
        expect(isSpanValid(text, '30 Nov', s.start, s.end)).toBe(true);
    });

    it('locates the corrected total in the invoice sample, not the original', () => {
        const invoice = SAMPLES.find((s) => s.id === 'invoice')!.text;
        const corrected = cpSpan(invoice, '€2,480.00');
        const field = normalizeField(invoice, 'total', TOTAL, { ...corrected, confidence: 0.88 });
        expect(field.status).toBe('found');
        expect(field.items[0].located).toBe(true);
        expect(Array.from(invoice).slice(corrected.start, corrected.end).join('')).toBe('€2,480.00');
    });
});

describe('invalid spans are never highlighted', () => {
    const text = 'Fee: US$ 6,500 fixed';
    const good = cpSpan(text, 'US$ 6,500');

    it.each([
        ['negative start', -1, good.end],
        ['end before start', good.end, good.start],
        ['empty span', good.start, good.start],
        ['end past text', good.start, 999],
        ['fractional', 5.5, 14],
        ['string offsets', '5', '14'],
        ['null offsets', null, null],
        ['NaN', Number.NaN, 14],
    ])('%s', (_label, start, end) => {
        expect(isSpanValid(text, 'US$ 6,500', start, end)).toBe(false);
        const field = normalizeField(text, 'total', TOTAL, { value: 'US$ 6,500', start, end, confidence: 0.9 });
        expect(field.status).toBe('found');
        expect(field.items[0].located).toBe(false);
        expect(field.reviewSuggested).toBe(true);
    });

    it('rejects offsets that point at different text (mismatch)', () => {
        expect(isSpanValid(text, 'US$ 6,500', good.start + 1, good.end + 1)).toBe(false);
        const field = normalizeField(text, 'total', TOTAL, { value: 'US$ 9,999', start: good.start, end: good.end, confidence: 0.95 });
        expect(field.items[0].located).toBe(false);
    });
});

describe('null and malformed field values', () => {
    const text = 'Effective date: on countersignature';

    it('null value => not found (not an error)', () => {
        const f = normalizeField(text, 'total', TOTAL, { value: null, start: null, end: null, confidence: 0.9 });
        expect(f.status).toBe('not_found');
        expect(f.items).toEqual([]);
    });

    it('missing field => not found', () => {
        expect(normalizeField(text, 'total', TOTAL, undefined).status).toBe('not_found');
    });

    it('non-object field / non-string value => unreadable, never invented', () => {
        expect(normalizeField(text, 'total', TOTAL, 'oops').status).toBe('unreadable');
        expect(normalizeField(text, 'total', TOTAL, 42).status).toBe('unreadable');
        expect(normalizeField(text, 'total', TOTAL, { value: { nested: true } }).status).toBe('unreadable');
    });

    it('low confidence => review suggested', () => {
        const s = cpSpan(text, 'on countersignature');
        const f = normalizeField(text, 'total', TOTAL, { ...s, confidence: 0.4 });
        expect(f.items[0].located).toBe(true);
        expect(f.reviewSuggested).toBe(true);
    });

    it('high confidence + located => no review flag', () => {
        const s = cpSpan(text, 'on countersignature');
        expect(normalizeField(text, 'total', TOTAL, { ...s, confidence: 0.9 }).reviewSuggested).toBe(false);
    });

    it('confidence outside 0..1 is ignored, not trusted', () => {
        const s = cpSpan(text, 'on countersignature');
        const f = normalizeField(text, 'total', TOTAL, { ...s, confidence: 7 });
        expect(f.confidence).toBeNull();
        expect(f.reviewSuggested).toBe(true);
    });
});

describe('list fields', () => {
    const text = '1. Jonas Feld Consulting\n2. Harbourlight Cooperative';

    it('verifies each item independently and caps at max_items', () => {
        const a = cpSpan(text, 'Jonas Feld Consulting');
        const b = cpSpan(text, 'Harbourlight Cooperative');
        const items = [a, { ...b, start: b.start + 3, end: b.end + 3 }, a, a, a, a].map((x) => ({ ...x, confidence: 0.9 }));
        const f = normalizeField(text, 'parties', PARTIES, { value: items, confidence: 0.9 });
        expect(f.items).toHaveLength(4);
        expect(f.items[0].located).toBe(true);
        expect(f.items[1].located).toBe(false);
    });

    it('empty list => not found; malformed items are dropped and flagged', () => {
        expect(normalizeField(text, 'parties', PARTIES, { value: [] }).status).toBe('not_found');
        const a = cpSpan(text, 'Jonas Feld Consulting');
        const f = normalizeField(text, 'parties', PARTIES, { value: [{ ...a, confidence: 0.9 }, 12, { value: false }] });
        expect(f.items).toHaveLength(1);
        expect(f.reviewSuggested).toBe(true);
        expect(normalizeField(text, 'parties', PARTIES, { value: [12] }).status).toBe('unreadable');
    });
});

