import { useEffect, useMemo, useRef } from 'react';
import { isSpanValid } from '@/shared/spans';

export interface ActiveSpan {
    label: string;
    value: string;
    start: number;
    end: number;
}

interface EvidenceViewProps {
    text: string;
    span: ActiveSpan | null;
}

/** Renders the analyzed text verbatim and marks the selected span by code-point offsets. */
const EvidenceView = ({ text, span }: EvidenceViewProps) => {
    const markRef = useRef<HTMLElement>(null);

    const parts = useMemo(() => {
        // Re-verify at render time: never highlight anything that doesn't match exactly.
        if (!span || !isSpanValid(text, span.value, span.start, span.end)) return null;
        const points = Array.from(text);
        return {
            before: points.slice(0, span.start).join(''),
            match: points.slice(span.start, span.end).join(''),
            after: points.slice(span.end).join(''),
        };
    }, [text, span]);

    useEffect(() => {
        if (!parts || !markRef.current) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        markRef.current.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }, [parts]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
                {parts && span ? (
                    <>
                        Showing source for <span className="font-medium text-foreground">{span.label}</span>
                    </>
                ) : span ? (
                    'Source location unavailable for this fact.'
                ) : (
                    'Select a fact on the right to highlight where it appears.'
                )}
            </p>
            <div
                role="region"
                aria-label="Analyzed source document"
                tabIndex={0}
                className="min-h-[360px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-sunken/50 px-4 py-3.5 font-mono text-[13px] leading-[1.7] lg:max-h-[560px] lg:min-h-[520px]"
            >
                {parts ? (
                    <>
                        {parts.before}
                        <mark ref={markRef} className="source-mark">
                            {parts.match}
                        </mark>
                        {parts.after}
                    </>
                ) : (
                    text
                )}
            </div>
        </div>
    );
};

export default EvidenceView;

