/**
 * Display components: Card, Badge, Skeleton, EmptyState, ErrorState.
 *
 *   <Card as="section" aria-labelledby="x">...</Card>
 *   <Badge tone="completed">Done</Badge>
 *   <Skeleton className="h-6 w-40" />                 (decorative; announce loading elsewhere)
 *   <EmptyState icon={Sprout} title="No habits yet" action={<Button>Add habit</Button>} />
 *   <ErrorState error={error} onRetry={refetch} />
 */
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';

/** A raised surface grouping related content. `as` picks the element (section, article...). */
export function Card({ as: Element = 'div', className, children, ...rest }) {
  return (
    <Element
      className={cn(
        'rounded-xl border border-border bg-surface-raised p-4 shadow-sm sm:p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </Element>
  );
}

/**
 * Habit status tones follow the "never punitive" palette (styles/index.css): missed is a calm
 * stone colour, not red. `danger` is only for real problems (e.g. "Archived" warnings).
 */
const BADGE_TONES = {
  neutral: 'bg-surface-muted text-fg-muted',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100',
  completed: 'bg-status-completed-soft text-status-completed',
  pending: 'bg-status-pending-soft text-status-pending',
  missed: 'bg-status-missed-soft text-status-missed',
  unscheduled: 'bg-status-unscheduled-soft text-status-unscheduled',
  danger: 'bg-danger-soft text-danger',
};

/** A small label. Colour is never the only signal: always include readable text. */
export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A grey placeholder shape shown while content loads. Hidden from screen readers. */
export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
    />
  );
}

/** Friendly "nothing here yet" message with an optional call to action. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-4 rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon aria-hidden="true" className="h-6 w-6" />
        </div>
      )}
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Something failed to load. Shows the API error's message (already user-friendly, see
 * ApiError) and an optional Retry button.
 */
export function ErrorState({ title = "We couldn't load this", error, onRetry, className }) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-4 py-12 text-center', className)}
    >
      <AlertCircle aria-hidden="true" className="mb-3 h-8 w-8 text-fg-muted" />
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {error?.message && <p className="mt-1 max-w-sm text-sm text-fg-muted">{error.message}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
