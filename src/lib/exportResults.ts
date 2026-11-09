import { SCHEMA_TITLES } from '@/shared/schemas';
import type { AnalysisResult } from '@/shared/types';

export function formatConfidence(c: number | null): string {
    return c === null ? 'not reported' : `${Math.round(c * 100)}%`;
}

/** Plain-text summary for the clipboard. Confidence is labelled as model-reported, not correctness. */
export function buildPlainSummary(result: AnalysisResult): string {
    const lines: string[] = [];
    const c = result.classification;
    lines.push('Proofline analysis');
    lines.push(`Document type: ${SCHEMA_TITLES[c.schema]} (model choice: ${c.choice ?? 'none'}, model confidence ${formatConfidence(c.confidence)})`);
    if (result.status === 'partial') lines.push('Status: PARTIAL RESULT');
    for (const w of result.warnings) lines.push(`! ${w}`);
    lines.push('');
    lines.push('Source-backed facts');
    for (const f of result.fields) {
        if (f.status === 'not_found') {
            lines.push(`- ${f.label}: Not found`);
            continue;
        }
        if (f.status === 'unreadable') {
            lines.push(`- ${f.label}: Result unreadable — review the document`);
            continue;
        }
        const flag = f.reviewSuggested ? ' [Review suggested]' : '';
        if (f.list) {
            lines.push(`- ${f.label}:${flag}`);
            for (const i of f.items) lines.push(`    • ${i.value}${i.located ? '' : ' (source location unavailable)'}`);
        } else {
            const i = f.items[0];
            lines.push(`- ${f.label}: ${i.value}${i.located ? '' : ' (source location unavailable)'}${flag}`);
        }
    }
    lines.push('');
    if (result.draft) {
        lines.push(result.draft.label);
        lines.push(`Suggested next step: ${result.draft.next_step ?? '—'}`);
        lines.push(`Check before use: ${result.draft.missing_details ?? '—'}`);
    } else {
        lines.push('AI draft unavailable.');
    }
    return lines.join('\n');
}

/** Builds the JSON export. Only called after an explicit Download click. */
export function buildExport(result: AnalysisResult, source: string) {
    return {
        app: 'Proofline',
        exportedAt: new Date().toISOString(),
        note: 'Confidence values are model-reported and do not guarantee correctness. Offsets are Unicode code points, end exclusive.',
        source,
        result,
    };
}

export function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

