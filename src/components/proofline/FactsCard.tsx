import { MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldResult } from '@/shared/spans';
import { formatConfidence } from '@/lib/exportResults';
import ReviewBadge from './ReviewBadge';

export interface Selection {
    key: string;
    index: number;
}

interface FactsCardProps {
    fields: FieldResult[];
    selection: Selection | null;
    onSelect: (sel: Selection) => void;
}

const FactRow = ({ field, selection, onSelect }: { field: FieldResult; selection: Selection | null; onSelect: (s: Selection) => void }) => (
    <li className="grid gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">{field.label}</span>
            <div className="flex items-center gap-2">
                {field.status === 'found' && (
                    <span className="font-mono text-[11px] text-muted-foreground" title="Model-reported confidence, not a guarantee of correctness">
                        model conf. {formatConfidence(field.confidence)}
                    </span>
                )}
                {field.reviewSuggested && <ReviewBadge />}
            </div>
        </div>

        {field.status === 'not_found' && <p className="font-display text-[15px] italic text-muted-foreground">Not found</p>}
        {field.status === 'unreadable' && (
            <p className="text-[13px] text-review">The result for this field could not be read. Check the document directly.</p>
        )}

        {field.status === 'found' && (
            <ul className="flex flex-col gap-1">
                {field.items.map((item, index) => {
                    const selected = selection?.key === field.key && selection.index === index;
                    return (
                        <li key={index}>
                            {item.located ? (
                                <button
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onSelect({ key: field.key, index })}
                                    className={cn(
                                        '-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left text-[15px] leading-snug transition-colors duration-200',
                                        selected ? 'bg-highlight text-foreground' : 'hover:bg-accent',
                                    )}
                                >
                                    {field.list && <span className="mr-1.5 text-primary" aria-hidden>·</span>}
                                    {item.value}
                                    <span className="sr-only"> — show in source</span>
                                </button>
                            ) : (
                                <div className="flex flex-col gap-0.5 py-1">
                                    <span className="text-[15px] leading-snug">
                                        {field.list && <span className="mr-1.5 text-primary" aria-hidden>·</span>}
                                        {item.value}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[12px] text-review">
                                        <MapPinOff className="h-3 w-3" aria-hidden />
                                        Source location unavailable
                                    </span>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        )}
    </li>
);

const FactsCard = ({ fields, selection, onSelect }: FactsCardProps) => (
    <section aria-labelledby="facts-heading" className="panel rise-in flex flex-col gap-3 p-4 sm:p-5" style={{ animationDelay: '60ms' }}>
        <div className="flex items-baseline justify-between gap-3">
            <h3 id="facts-heading" className="font-display text-xl font-semibold tracking-[-0.01em]">
                Source-backed facts
            </h3>
            <span className="eyebrow">stage 2</span>
        </div>
        <ul className="flex flex-col">
            {fields.map((f) => (
                <FactRow key={f.key} field={f} selection={selection} onSelect={onSelect} />
            ))}
        </ul>
        <p className="border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
            Select a fact to highlight its exact words in the source. Confidence is the model's own estimate and does not guarantee correctness.
        </p>
    </section>
);

export default FactsCard;

