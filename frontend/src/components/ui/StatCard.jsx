/**
 * StatCard: one headline number with its label and an optional hint.
 *   <StatCard label="Completion rate" value="82%" hint="Last 30 days" />
 * Rendered as a description list term/value pair inside a card, so screen readers read
 * "Completion rate: 82%". `value` may be a node (e.g. "—" with an explanation).
 */
import { cn } from '../../lib/cn.js';

export function StatCard({ label, value, hint, icon: Icon, className }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface-raised p-4', className)}>
      <dt className="flex items-center gap-1.5 text-sm text-fg-muted">
        {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-fg">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}

/** A responsive grid of StatCards (a <dl>, so each card is a term + value). */
export function StatGrid({ children, className }) {
  return <dl className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</dl>;
}
