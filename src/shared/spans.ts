import { REVIEW_THRESHOLD } from './limits';
import type { FieldSpec } from './schemas';

export interface EvidenceItem {
    value: string;
    /** Offsets as reported by Clocked: Unicode code points, end exclusive. */
    start: number | null;
    end: number | null;
    confidence: number | null;
    /** True only when the reported span slices to exactly `value` in the analyzed text. */
    located: boolean;
}

export type FieldStatus = 'found' | 'not_found' | 'unreadable';

export interface FieldResult {
    key: string;
    label: string;
    list: boolean;
    status: FieldStatus;
    items: EvidenceItem[];
    confidence: number | null;
    reviewSuggested: boolean;
}

export function sliceCodePoints(text: string, start: number, end: number): string {
    return Array.from(text).slice(start, end).join('');
}

/** A span is usable only if offsets are sane integers and slice to the exact value. */
export function isSpanValid(text: string, value: unknown, start: unknown, end: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (typeof start !== 'number' || typeof end !== 'number') return false;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    const points = Array.from(text);
    if (start < 0 || end <= start || end > points.length) return false;
    return points.slice(start, end).join('') === value;
}

function toNumber(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toConfidence(v: unknown): number | null {
    const n = toNumber(v);
    return n !== null && n >= 0 && n <= 1 ? n : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns an item, `null` for an explicit empty value, or 'bad' for a malformed entry. */
function toItem(text: string, raw: unknown, fallbackConfidence: number | null): EvidenceItem | null | 'bad' {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
        return raw.length === 0 ? null : { value: raw, start: null, end: null, confidence: fallbackConfidence, located: false };
    }
    if (!isRecord(raw)) return 'bad';
    const value = raw.value;
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return 'bad';
    if (value.length === 0) return null;
    const start = toNumber(raw.start);
    const end = toNumber(raw.end);
    return {
        value,
        start,
        end,
        confidence: toConfidence(raw.confidence) ?? fallbackConfidence,
        located: isSpanValid(text, value, start, end),
    };
}

/** Normalises one Clocked /extract field against the analyzed text. Never invents spans. */
export function normalizeField(text: string, key: string, spec: FieldSpec, raw: unknown): FieldResult {
    const base = { key, label: spec.label, list: spec.list };
    if (raw === null || raw === undefined) {
        return { ...base, status: 'not_found', items: [], confidence: null, reviewSuggested: false };
    }
    if (!isRecord(raw)) {
        return { ...base, status: 'unreadable', items: [], confidence: null, reviewSuggested: true };
    }

    const fieldConfidence = toConfidence(raw.confidence);
    const value = raw.value;
    if (value === null || value === undefined) {
        return { ...base, status: 'not_found', items: [], confidence: fieldConfidence, reviewSuggested: false };
    }

    const rawItems: unknown[] = Array.isArray(value) ? value : [raw];
    const items: EvidenceItem[] = [];
    let malformed = false;
    for (const entry of rawItems) {
        const item = toItem(text, entry, fieldConfidence);
        if (item === 'bad') malformed = true;
        else if (item) items.push(item);
    }
    const limited = spec.list && spec.maxItems ? items.slice(0, spec.maxItems) : spec.list ? items : items.slice(0, 1);

    if (limited.length === 0) {
        return {
            ...base,
            status: malformed ? 'unreadable' : 'not_found',
            items: [],
            confidence: fieldConfidence,
            reviewSuggested: malformed,
        };
    }

    const confidences = [fieldConfidence, ...limited.map((i) => i.confidence)];
    const lowOrMissing = confidences.some((c) => c !== null && c < REVIEW_THRESHOLD) || confidences.every((c) => c === null);
    return {
        ...base,
        status: 'found',
        items: limited,
        confidence: fieldConfidence ?? (limited.length === 1 ? limited[0].confidence : null),
        reviewSuggested: lowOrMissing || malformed || limited.some((i) => !i.located),
    };
}

