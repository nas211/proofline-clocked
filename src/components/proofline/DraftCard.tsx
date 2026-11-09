import { Sparkles } from 'lucide-react';
import { AI_DRAFT_LABEL } from '@/shared/schemas';
import type { DraftResult } from '@/shared/types';

const DraftCard = ({ draft }: { draft: DraftResult | null }) => (
    <section
        aria-labelledby="draft-heading"
        className="rise-in flex flex-col gap-3 rounded-lg border border-dashed border-primary/45 bg-primary-soft/60 p-4 sm:p-5"
        style={{ animationDelay: '120ms' }}
    >
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="draft-heading" className="font-display text-xl font-semibold tracking-[-0.01em]">
                Action summary
            </h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                <Sparkles className="h-3 w-3" aria-hidden />
                {AI_DRAFT_LABEL}
            </span>
        </div>

        {draft ? (
            <dl className="grid gap-3">
                <div className="grid gap-0.5">
                    <dt className="eyebrow">Suggested next step</dt>
                    <dd className="font-display text-[17px] leading-snug">{draft.next_step ?? <span className="italic text-muted-foreground">Not provided</span>}</dd>
                </div>
                <div className="grid gap-0.5">
                    <dt className="eyebrow">Check before use</dt>
                    <dd className="text-[14px] leading-relaxed">{draft.missing_details ?? <span className="italic text-muted-foreground">Not provided</span>}</dd>
                </div>
            </dl>
        ) : (
            <p className="text-[13px] text-muted-foreground">No AI draft is available for this result. The evidence above was extracted successfully.</p>
        )}
        <p className="text-[12px] text-muted-foreground">Generated text, stage 3. It does not execute anything and may be wrong.</p>
    </section>
);

export default DraftCard;

