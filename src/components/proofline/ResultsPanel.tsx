import { useEffect, useState } from 'react';
import { AlertCircle, Copy, Download, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AnalysisResult } from '@/shared/types';
import type { ClientError } from '@/lib/analyzeClient';
import type { Phase } from '@/hooks/useAnalysis';
import ClassificationCard from './ClassificationCard';
import FactsCard, { type Selection } from './FactsCard';
import DraftCard from './DraftCard';

interface ResultsPanelProps {
    phase: Phase;
    result: AnalysisResult | null;
    error: ClientError | null;
    startedAt: number | null;
    stale: boolean;
    canRetry: boolean;
    selection: Selection | null;
    onSelect: (s: Selection) => void;
    onRetry: () => void;
    onDismissError: () => void;
    onCopy: () => void;
    onDownload: () => void;
}

const STAGES = ['Classify the document', 'Extract source-backed facts', 'Draft an action summary'];

const LoadingState = ({ startedAt }: { startedAt: number | null }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

    return (
        <div role="status" aria-live="polite" className="panel flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between">
                <p className="font-display text-xl font-semibold">Analyzing…</p>
                <span className="font-mono text-xs text-muted-foreground" aria-hidden>
                    {elapsed}s
                </span>
            </div>
            <div className="relative h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                <div className="scan-bar absolute inset-y-0 w-1/3 rounded-full bg-primary/70" />
            </div>
            <ol className="flex flex-col gap-2 text-[14px] text-muted-foreground">
                {STAGES.map((s, i) => (
                    <li key={s} className="flex items-center gap-3">
                        <span className="grid h-5 w-5 place-items-center rounded-full border border-border font-mono text-[11px]">{i + 1}</span>
                        {s}
                    </li>
                ))}
            </ol>
            <p className="text-[12px] text-muted-foreground">Stages run on the server; this can take up to 50 seconds. Your document is held in this tab only.</p>
        </div>
    );
};

const EmptyState = () => (
    <div className="panel flex flex-col gap-5 p-6 sm:p-7">
        <div className="flex flex-col gap-2">
            <p className="eyebrow">Results</p>
            <p className="font-display text-[1.6rem] font-medium leading-[1.15] tracking-[-0.015em]">
                Every fact, <span className="italic text-primary">with its receipt.</span>
            </p>
            <p className="max-w-[46ch] text-[14px] text-muted-foreground">
                Paste a document or load a sample, then Analyze. Extracted facts link back to the exact words in your source; anything the model can’t locate is marked.
            </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-md border border-border bg-border text-[13px] sm:grid-cols-3">
            {STAGES.map((s, i) => (
                <li key={s} className="flex flex-col gap-1 bg-surface p-3">
                    <span className="font-mono text-[11px] text-primary">0{i + 1}</span>
                    {s}
                </li>
            ))}
        </ol>
    </div>
);

const ErrorAlert = ({ error, canRetry, onRetry, onDismiss }: { error: ClientError; canRetry: boolean; onRetry: () => void; onDismiss: () => void }) => (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive-surface p-4">
        <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="flex flex-1 flex-col gap-1">
                <p className="font-medium text-destructive">{error.code === 'not_configured' ? 'Analysis unavailable' : 'Analysis failed'}</p>
                <p className="text-[14px] text-foreground">{error.message}</p>
            </div>
            <button type="button" onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Dismiss error">
                <X className="h-4 w-4" />
            </button>
        </div>
        {canRetry && (
            <div className="flex items-center gap-3 pl-7">
                <Button type="button" size="sm" variant="outline" onClick={onRetry} className="rounded-full border-destructive/30 bg-surface">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Retry same request
                </Button>
                <span className="text-[12px] text-muted-foreground">Reuses the same request ID, so it won’t be processed twice.</span>
            </div>
        )}
    </div>
);

const ResultsPanel = (props: ResultsPanelProps) => {
    const { phase, result, error, startedAt, stale, canRetry, selection, onSelect, onRetry, onDismissError, onCopy, onDownload } = props;
    const extraWarnings = result ? result.warnings.filter((w) => w !== result.classification.reviewReason) : [];

    return (
        <section aria-labelledby="results-heading" aria-busy={phase === 'loading'} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="results-heading" className="sr-only">
                    Results
                </h2>
                {result && phase !== 'loading' && (
                    <div className="ml-auto flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onCopy} className="rounded-full border-border bg-surface hover:bg-accent">
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            Copy results
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={onDownload} className="rounded-full border-border bg-surface hover:bg-accent">
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Download JSON
                        </Button>
                    </div>
                )}
            </div>

            {error && phase === 'error' && <ErrorAlert error={error} canRetry={canRetry} onRetry={onRetry} onDismiss={onDismissError} />}

            {phase === 'loading' && <LoadingState startedAt={startedAt} />}

            {phase !== 'loading' && !result && !error && <EmptyState />}

            {phase !== 'loading' && result && (
                <div className="flex flex-col gap-4" aria-live="polite">
                    {stale && (
                        <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-[13px] text-muted-foreground">
                            The source has changed since this analysis. Results refer to the analyzed version.
                        </p>
                    )}
                    {result.status === 'partial' && (
                        <p role="note" className="rounded-md border border-review-border bg-review-surface px-3 py-2 text-[13px] font-medium text-review">
                            Partial result — some stages did not complete.
                        </p>
                    )}
                    {extraWarnings.map((w) => (
                        <p key={w} className="rounded-md border border-review-border bg-review-surface px-3 py-2 text-[13px] text-review">
                            {w}
                        </p>
                    ))}
                    <ClassificationCard classification={result.classification} />
                    <FactsCard fields={result.fields} selection={selection} onSelect={onSelect} />
                    <DraftCard draft={result.draft} />
                </div>
            )}
        </section>
    );
};

export default ResultsPanel;

