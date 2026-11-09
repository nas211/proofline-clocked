/**
 * Input limits shared by the browser and the Netlify function.
 * Character limits count Unicode code points (what a person perceives as
 * characters far more closely than UTF-16 units), so an emoji counts as one.
 */

export const MAX_CHARS = 12_000;
export const MAX_REQUEST_BYTES = 32 * 1024;
/** Below this, model confidence triggers a "Review suggested" marker. */
export const REVIEW_THRESHOLD = 0.65;
/** Total server-side budget for all Clocked stages. */
export const UPSTREAM_TIMEOUT_MS = 50_000;
/** Browser waits slightly longer than the server budget. */
export const CLIENT_TIMEOUT_MS = 56_000;

export const ANALYZE_ENDPOINT = '/.netlify/functions/analyze';

export function countCodePoints(text: string): number {
    return Array.from(text).length;
}

export function utf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}

/** The exact JSON body the browser sends. Text is never trimmed or normalised. */
export function buildRequestBody(text: string, requestId: string): string {
    return JSON.stringify({ text, requestId });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

export type InputCheck =
    | { ok: true }
    | { ok: false; code: 'not_text' | 'blank' | 'too_long' | 'too_large'; message: string };

/** Validates document text. Blank check uses trim() but the text itself is never modified. */
export function checkDocumentText(text: unknown): InputCheck {
    if (typeof text !== 'string') {
        return { ok: false, code: 'not_text', message: 'Document text must be plain text.' };
    }
    if (text.trim().length === 0) {
        return { ok: false, code: 'blank', message: 'Paste a document before analyzing.' };
    }
    const chars = countCodePoints(text);
    if (chars > MAX_CHARS) {
        return {
            ok: false,
            code: 'too_long',
            message: `Documents are limited to ${MAX_CHARS.toLocaleString('en-US')} characters (this one has ${chars.toLocaleString('en-US')}).`,
        };
    }
    return { ok: true };
}

/** Full client-side check: text rules plus the encoded request size. */
export function checkOutgoingRequest(text: string, requestId: string): InputCheck {
    const base = checkDocumentText(text);
    if (!base.ok) return base;
    if (utf8ByteLength(buildRequestBody(text, requestId)) > MAX_REQUEST_BYTES) {
        return {
            ok: false,
            code: 'too_large',
            message: 'This document is too large to send (32 KB request limit). Emoji and non-Latin scripts use more bytes per character.',
        };
    }
    return { ok: true };
}

