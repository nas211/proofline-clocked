import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAnalysis } from '@/hooks/useAnalysis';
import { buildExport, buildPlainSummary, downloadJson } from '@/lib/exportResults';
import type { SampleDoc } from '@/lib/samples';
import AppHeader from '@/components/proofline/AppHeader';
import SourcePanel, { type SourceMode } from '@/components/proofline/SourcePanel';
import ResultsPanel from '@/components/proofline/ResultsPanel';
import type { Selection } from '@/components/proofline/FactsCard';
import type { ActiveSpan } from '@/components/proofline/EvidenceView';

const Index = () => {
    const [text, setText] = useState('');
    const [mode, setMode] = useState<SourceMode>('edit');
    const [selection, setSelection] = useState<Selection | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const analysis = useAnalysis();
    const { toast } = useToast();

    const resultId = analysis.result?.requestId;
    useEffect(() => {
        setSelection(null);
        setMode('edit');
    }, [resultId]);

    const activeSpan = useMemo<ActiveSpan | null>(() => {
        if (!selection || !analysis.result) return null;
        const field = analysis.result.fields.find((f) => f.key === selection.key);
        const item = field?.items[selection.index];
        if (!field || !item || item.start === null || item.end === null) return null;
        return { label: field.label, value: item.value, start: item.start, end: item.end };
    }, [selection, analysis.result]);

    const handleSelect = useCallback((s: Selection) => {
        setSelection(s);
        setMode('evidence');
    }, []);

    // Escape clears the active highlight.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelection(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleAnalyze = useCallback(() => {
        void analysis.analyze(text);
    }, [analysis, text]);

    const handleRetry = useCallback(() => {
        if (analysis.retryText !== null) {
            setText(analysis.retryText);
            void analysis.analyze(analysis.retryText);
        }
    }, [analysis]);

    const handleClear = useCallback(() => {
        analysis.clear();
        setText('');
        setSelection(null);
        setMode('edit');
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, [analysis]);

    const handleSample = useCallback((s: SampleDoc) => {
        setText(s.text);
        setMode('edit');
        setSelection(null);
    }, []);

    const handleCopy = useCallback(async () => {
        if (!analysis.result) return;
        try {
            await navigator.clipboard.writeText(buildPlainSummary(analysis.result));
            toast({ title: 'Results copied', description: 'Plain-text summary is on your clipboard.' });
        } catch {
            toast({ title: 'Copy failed', description: 'Your browser blocked clipboard access.', variant: 'destructive' });
        }
    }, [analysis.result, toast]);

    const handleDownload = useCallback(() => {
        if (!analysis.result || analysis.analyzedText === null) return;
        downloadJson(buildExport(analysis.result, analysis.analyzedText), `proofline-${analysis.result.requestId.slice(0, 8)}.json`);
    }, [analysis.result, analysis.analyzedText]);

    const loading = analysis.phase === 'loading';
    const isRetry = analysis.retryText !== null && analysis.retryText === text;

    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="container flex-1 pb-10">
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-6">
                    <SourcePanel
                        ref={textareaRef}
                        text={text}
                        onTextChange={setText}
                        onSample={handleSample}
                        onAnalyze={handleAnalyze}
                        onClear={handleClear}
                        loading={loading}
                        isRetry={isRetry}
                        mode={mode}
                        onModeChange={setMode}
                        analyzedText={analysis.analyzedText}
                        activeSpan={activeSpan}
                    />
                    <ResultsPanel
                        phase={analysis.phase}
                        result={analysis.result}
                        error={analysis.error}
                        startedAt={analysis.startedAt}
                        stale={analysis.analyzedText !== null && analysis.analyzedText !== text}
                        canRetry={analysis.retryText !== null}
                        selection={selection}
                        onSelect={handleSelect}
                        onRetry={handleRetry}
                        onDismissError={analysis.dismissError}
                        onCopy={handleCopy}
                        onDownload={handleDownload}
                    />
                </div>
            </main>
            <footer className="container pb-8">
                <p className="max-w-[80ch] border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">
                    When you click Analyze, your document is sent through Proofline’s server to the Clocked API for processing. Proofline keeps no copy: source and results live only in this browser tab until you clear or close it. AI output can be wrong — always check facts against the source.
                </p>
            </footer>
        </div>
    );
};

export default Index;

