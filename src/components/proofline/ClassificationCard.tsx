import { SCHEMA_TITLES } from '@/shared/schemas';
import type { Classification } from '@/shared/types';
import { formatConfidence } from '@/lib/exportResults';
import ReviewBadge from './ReviewBadge';

const ORDER = ['invoice', 'agreement', 'notes', 'other'];

const ClassificationCard = ({ classification }: { classification: Classification }) => {
    const c = classification;
    const probs = ORDER.filter((k) => k in c.probabilities).map((k) => [k, c.probabilities[k]] as const);

    return (
        <section aria-labelledby="doctype-heading" className="panel rise-in flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="eyebrow">Document type · stage 1</span>
                    <h3 id="doctype-heading" className="font-display text-2xl font-semibold leading-tight tracking-[-0.015em]">
                        {SCHEMA_TITLES[c.schema]}
                    </h3>
                    <p className="text-[13px] text-muted-foreground">
                        Model choice <span className="font-mono text-foreground">{c.choice ?? '—'}</span> · model confidence{' '}
                        <span className="font-mono text-foreground">{formatConfidence(c.confidence)}</span>
                    </p>
                </div>
                {c.reviewRequired && <ReviewBadge />}
            </div>

            {c.reviewRequired && c.reviewReason && (
                <p role="note" className="rounded-md border border-review-border bg-review-surface px-3 py-2 text-[13px] text-review">
                    {c.reviewReason}
                </p>
            )}

            {probs.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    {probs.map(([k, p]) => (
                        <div key={k} className="flex flex-col gap-1">
                            <dt className="flex justify-between font-mono text-[11px] text-muted-foreground">
                                <span>{k}</span>
                                <span>{Math.round(p * 100)}%</span>
                            </dt>
                            <dd className="h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                                <div
                                    className={k === c.choice ? 'h-full rounded-full bg-primary' : 'h-full rounded-full bg-muted-foreground/40'}
                                    style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
                                />
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
};

export default ClassificationCard;

