/**
 * "3 of 5 done" with a progress ring. At 100% a small, quiet celebration appears (a pop-in
 * message; no confetti). Animations are motion-safe only, and the global reduced-motion rule
 * disables them entirely for users who ask for that.
 *
 * Accessibility: the ring is decorative; the text and a role="progressbar" carry the information.
 */
import { PartyPopper } from 'lucide-react';
import { Card } from '../../components/ui/index.js';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * @param {{ summary: { scheduled: number, completed: number, percent: number | null },
 *   isToday: boolean }} props
 */
export function ProgressSummary({ summary, isToday }) {
  const { scheduled, completed } = summary;
  const percent = summary.percent ?? 0;
  const allDone = scheduled > 0 && completed === scheduled;

  return (
    <Card className="flex items-center gap-4">
      <div
        role="progressbar"
        aria-label={isToday ? "Today's progress" : 'Progress that day'}
        aria-valuemin={0}
        aria-valuemax={scheduled}
        aria-valuenow={completed}
        aria-valuetext={`${completed} of ${scheduled} done`}
        className="relative h-16 w-16 shrink-0"
      >
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-surface-muted"
          />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-status-completed transition-[stroke-dashoffset] duration-500"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold"
        >
          {percent}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-fg">
          {completed} of {scheduled} done
        </p>
        {allDone ? (
          <p
            role="status"
            className="motion-safe:animate-pop mt-0.5 flex items-center gap-1.5 text-sm font-medium text-status-completed"
          >
            <PartyPopper aria-hidden="true" className="h-4 w-4" />
            {isToday ? 'All done for today. Nicely done!' : 'Everything was done that day.'}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-fg-muted">
            {scheduled - completed} to go{isToday ? ', you’ve got this.' : '.'}
          </p>
        )}
      </div>
    </Card>
  );
}
