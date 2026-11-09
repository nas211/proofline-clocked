/** Random v4 UUID for one logical analysis request. */
export function newRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface PendingAttempt {
    text: string;
    requestId: string;
    /** True when the previous outcome is unknown (network/timeout/5xx) and a retry must reuse the same ID. */
    retryable: boolean;
}

/**
 * Chooses the logical request ID for the next click.
 * Same text after an unknown outcome => same ID (so the server reuses the same
 * Idempotency-Keys). Anything else => a fresh ID. Never mints a new ID for a retry.
 */
export function chooseRequestId(text: string, previous: PendingAttempt | null, mint: () => string = newRequestId): { requestId: string; isRetry: boolean } {
    if (previous && previous.retryable && previous.text === text) {
        return { requestId: previous.requestId, isRetry: true };
    }
    return { requestId: mint(), isRetry: false };
}

