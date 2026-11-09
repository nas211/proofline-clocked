import { useCallback, useRef, useState } from 'react';
import { checkOutgoingRequest } from '@/shared/limits';
import type { AnalysisResult } from '@/shared/types';
import { postAnalysis, type ClientError } from '@/lib/analyzeClient';
import { chooseRequestId, type PendingAttempt } from '@/lib/requestId';

export type Phase = 'idle' | 'loading' | 'success' | 'error';

interface State {
    phase: Phase;
    result: AnalysisResult | null;
    /** Exact text the current result refers to. Kept in memory only. */
    analyzedText: string | null;
    error: ClientError | null;
    startedAt: number | null;
}

const INITIAL: State = { phase: 'idle', result: null, analyzedText: null, error: null, startedAt: null };

/** All analysis state lives in React memory only — nothing is written to storage. */
export function useAnalysis() {
    const [state, setState] = useState<State>(INITIAL);
    const inFlight = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const lastAttempt = useRef<PendingAttempt | null>(null);
    const [retryText, setRetryText] = useState<string | null>(null);

    const analyze = useCallback(async (text: string) => {
        if (inFlight.current) return; // duplicate click guard
        const { requestId } = chooseRequestId(text, lastAttempt.current);
        const check = checkOutgoingRequest(text, requestId);
        if (!check.ok) {
            setState((s) => ({ ...s, phase: 'error', error: { code: check.code, message: check.message, retryable: false, status: null } }));
            return;
        }

        inFlight.current = true;
        const controller = new AbortController();
        controllerRef.current = controller;
        setState((s) => ({ ...s, phase: 'loading', error: null, startedAt: Date.now() }));

        const outcome = await postAnalysis(text, requestId, controller.signal);
        inFlight.current = false;
        controllerRef.current = null;
        if (controller.signal.aborted) return; // cleared while running

        if (outcome.ok) {
            lastAttempt.current = null;
            setRetryText(null);
            setState({ phase: 'success', result: outcome.result, analyzedText: text, error: null, startedAt: null });
        } else {
            lastAttempt.current = { text, requestId, retryable: outcome.error.retryable };
            setRetryText(outcome.error.retryable ? text : null);
            setState((s) => ({ ...s, phase: 'error', error: outcome.error, startedAt: null }));
        }
    }, []);

    const clear = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        inFlight.current = false;
        lastAttempt.current = null;
        setRetryText(null);
        setState(INITIAL);
    }, []);

    const dismissError = useCallback(() => {
        setState((s) => ({ ...s, phase: s.result ? 'success' : 'idle', error: null }));
    }, []);

    return { ...state, analyze, clear, dismissError, retryText };
}

