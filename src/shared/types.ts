import type { SchemaKey } from './schemas';
import type { FieldResult } from './spans';

export type Stage = 'decide' | 'extract' | 'fill';

export interface Classification {
    /** Raw choice returned by Clocked /decide. */
    choice: string | null;
    confidence: number | null;
    probabilities: Record<string, number>;
    schema: SchemaKey;
    reviewRequired: boolean;
    reviewReason: string | null;
}

export interface DraftResult {
    label: string;
    next_step: string | null;
    missing_details: string | null;
}

export interface AnalysisResult {
    requestId: string;
    status: 'complete' | 'partial';
    classification: Classification;
    fields: FieldResult[];
    draft: DraftResult | null;
    warnings: string[];
    stages: Record<Stage, 'ok' | 'failed'>;
}

export interface AnalysisErrorBody {
    error: {
        code: string;
        message: string;
        retryable: boolean;
        stage?: Stage;
    };
}

