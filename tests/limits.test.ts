import { describe, expect, it } from 'vitest';
import {
    MAX_CHARS,
    MAX_REQUEST_BYTES,
    buildRequestBody,
    checkDocumentText,
    checkOutgoingRequest,
    countCodePoints,
    isUuid,
    utf8ByteLength,
} from '../src/shared/limits';

const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('input boundaries', () => {
    it('rejects blank and whitespace-only input (including Unicode spaces)', () => {
        expect(checkDocumentText('')).toMatchObject({ ok: false, code: 'blank' });
        expect(checkDocumentText('   \n\t  ')).toMatchObject({ ok: false, code: 'blank' });
        expect(checkDocumentText('\u00a0\u2003\u3000')).toMatchObject({ ok: false, code: 'blank' });
    });

    it('rejects non-string text', () => {
        expect(checkDocumentText(42)).toMatchObject({ ok: false, code: 'not_text' });
        expect(checkDocumentText(null)).toMatchObject({ ok: false, code: 'not_text' });
    });

    it('accepts exactly 12000 characters and rejects 12001', () => {
        expect(checkDocumentText('a'.repeat(MAX_CHARS))).toEqual({ ok: true });
        expect(checkDocumentText('a'.repeat(MAX_CHARS + 1))).toMatchObject({ ok: false, code: 'too_long' });
    });

    it('counts Unicode code points, not UTF-16 units', () => {
        const emoji = '💶';
        expect(emoji.length).toBe(2);
        expect(countCodePoints(emoji)).toBe(1);
        // 6000 emoji = 12000 UTF-16 units but only 6000 characters.
        expect(checkDocumentText(emoji.repeat(6000))).toEqual({ ok: true });
        expect(checkDocumentText('🗓️')).toEqual({ ok: true }); // emoji + variation selector = 2 code points
        expect(countCodePoints('🗓️')).toBe(2);
    });

    it('enforces the 32KB request size even when the character count is fine', () => {
        const heavy = '💶'.repeat(MAX_CHARS); // 12000 chars, ~48KB UTF-8
        expect(checkDocumentText(heavy)).toEqual({ ok: true });
        expect(utf8ByteLength(buildRequestBody(heavy, ID))).toBeGreaterThan(MAX_REQUEST_BYTES);
        expect(checkOutgoingRequest(heavy, ID)).toMatchObject({ ok: false, code: 'too_large' });
        expect(checkOutgoingRequest('a'.repeat(MAX_CHARS), ID)).toEqual({ ok: true });
    });

    it('does not trim or normalise submitted text', () => {
        const text = '  leading\r\ntrailing  \n';
        expect(JSON.parse(buildRequestBody(text, ID)).text).toBe(text);
    });

    it('validates request UUIDs', () => {
        expect(isUuid(ID)).toBe(true);
        expect(isUuid('not-a-uuid')).toBe(false);
        expect(isUuid(undefined)).toBe(false);
    });
});

