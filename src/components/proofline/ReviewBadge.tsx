import { AlertTriangle } from 'lucide-react';

const ReviewBadge = ({ label = 'Review suggested' }: { label?: string }) => (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-review-border bg-review-surface px-2 py-0.5 text-[11px] font-medium text-review">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {label}
    </span>
);

export default ReviewBadge;

