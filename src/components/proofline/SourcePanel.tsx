import { forwardRef, type KeyboardEvent } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SAMPLES, type SampleDoc } from '@/lib/samples';
import { MAX_CHARS, countCodePoints } from '@/shared/limits';
import EvidenceView, { type ActiveSpan } from './EvidenceView';

export type SourceMode = 'edit' | 'evidence';

interface SourcePanelProps {
    text: string;
    onTextChange: (value: string) => void;
    onSample: (sample: SampleDoc) => void;
    onAnalyze: () => void;
    onClear: () => void;
    loading: boolean;
    isRetry: boolean;
    mode: SourceMode;
    onModeChange: (mode: SourceMode) => void;
    analyzedText: string | null;
    activeSpan: ActiveSpan | null;
}

const SourcePanel = forwardRef<HTMLTextAreaElement, SourcePanelProps>(
    ({ text, onTextChange, onSample, onAnalyze, onClear, loading, isRetry, mode, onModeChange, analyzedText, activeSpan }, ref) => {
        const count = countCodePoints(text);
        const over = count > MAX_CHARS;
        const blank = text.trim().length === 0;
        const canAnalyze = !loading && !blank && !over;
        const hasAnalysis = analyzedText !== null;
        const showEvidence = hasAnalysis && mode === 'evidence';
        const edited = hasAnalysis && analyzedText !== text;

        const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (canAnalyze) onAnalyze();
            }
        };

        return (
            <section aria-labelledby="source-heading" className="panel flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="source-heading" className="font-display text-xl font-semibold tracking-[-0.01em]">
                        Source
                    </h2>
                    <div role="group" aria-label="Load a fictional sample" className="flex items-center gap-1.5">
                        <span className="eyebrow mr-1 hidden sm:inline">Samples</span>
                        {SAMPLES.map((s) => (
                            <Button
                                key={s.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={loading}
                                onClick={() => onSample(s)}
                                className="h-8 rounded-full border-border bg-surface px-3 text-[13px] hover:bg-accent hover:text-accent-foreground"
                            >
                                {s.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {hasAnalysis && (
                    <div role="group" aria-label="Source view" className="inline-flex w-fit rounded-full border border-border bg-surface-sunken p-0.5">
                        {(['edit', 'evidence'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                aria-pressed={mode === m}
                                onClick={() => onModeChange(m)}
                                className={cn(
                                    'rounded-full px-3 py-1 text-[13px] transition-colors duration-200',
                                    mode === m ? 'bg-surface text-foreground shadow-panel' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {m === 'edit' ? 'Edit text' : 'Evidence view'}
                            </button>
                        ))}
                    </div>
                )}

                {showEvidence ? (
                    <>
                        {edited && (
                            <p className="rounded-md border border-review-border bg-review-surface px-3 py-2 text-[13px] text-review">
                                Showing the version that was analyzed. Your edits are kept in the editor.
                            </p>
                        )}
                        <EvidenceView text={analyzedText} span={activeSpan} />
                    </>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="source-input" className="sr-only">
                            Document text
                        </label>
                        <textarea
                            ref={ref}
                            id="source-input"
                            value={text}
                            onChange={(e) => onTextChange(e.target.value)}
                            onKeyDown={onKeyDown}
                            readOnly={loading}
                            spellCheck={false}
                            aria-describedby="source-help source-count"
                            aria-invalid={over || undefined}
                            placeholder="Paste an invoice, service agreement or meeting notes…"
                            className="min-h-[360px] w-full resize-y rounded-md border border-input bg-surface-sunken/40 px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:min-h-[520px]"
                        />
                    </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                        <p id="source-count" className={cn('font-mono text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
                            {count.toLocaleString('en-US')} / {MAX_CHARS.toLocaleString('en-US')} characters
                            {over && ' — over the limit'}
                        </p>
                        <p id="source-help" className="text-xs text-muted-foreground">
                            <kbd className="font-mono">Ctrl</kbd>/<kbd className="font-mono">⌘</kbd> + <kbd className="font-mono">Enter</kbd> to analyze. Plain text only.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClear}
                            disabled={blank && !hasAnalysis && !loading}
                            className="text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
                        >
                            Clear
                        </Button>
                        <Button
                            type="button"
                            onClick={onAnalyze}
                            disabled={!canAnalyze}
                            aria-disabled={!canAnalyze}
                            className="min-w-[132px] rounded-full shadow-lift transition-transform duration-200 hover:-translate-y-px"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    Analyzing…
                                </>
                            ) : isRetry ? (
                                <>
                                    <RotateCcw className="h-4 w-4" aria-hidden />
                                    Retry analysis
                                </>
                            ) : (
                                'Analyze'
                            )}
                        </Button>
                    </div>
                </div>
            </section>
        );
    },
);

SourcePanel.displayName = 'SourcePanel';

export default SourcePanel;

