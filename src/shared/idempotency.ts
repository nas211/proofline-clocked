/**
 * Derives a stable Idempotency-Key per (logical request, endpoint).
 * The browser supplies one logical request UUID; the server derives a distinct
 * UUID for /decide, /extract and /fill. Retrying the same logical request with the
 * same payload therefore reuses the exact same keys — a new key is never minted
 * for a retry.
 */
export async function deriveIdempotencyKey(requestId: string, endpoint: string): Promise<string> {
    const data = new TextEncoder().encode(`proofline:v1:${requestId.toLowerCase()}:${endpoint}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const b = digest.slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x80; // version 8 (custom, RFC 9562)
    b[8] = (b[8] & 0x3f) | 0x80; // RFC variant
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

