/**
 * One habit on the Today page: icon, name, category, schedule, streak, "due" indicator and the
 * big completion toggle.
 *
 * The toggle is a <button aria-pressed>, a standard toggle button: screen readers say
 * "Mark Read 10 pages complete, toggle button, pressed / not pressed". The name stays the same in
 * both states (the pressed state carries the change). It is 44×44 px, the minimum comfortable
 * touch target. While its request is in flight, or on a read-only (future) day, it is
 * aria-disabled rather than `disabled`: it stays focusable (a disabled button can't hold focus,
 * which would break focus restoring below) and clicks are simply ignored.
 *
 * Ticking moves the row between the "To do" and "Done" groups, which remounts it. If the toggle
 * had keyboard focus, `focusRequestRef` (a ref shared by the page) brings focus back to the same
 * habit's toggle in its new place, so keyboard users never lose their position.
 *
 * Visual states follow the never-punitive palette: completed = green fill, open = neutral ring,
 * missed (a past day) = calm dashed stone ring, never red.
 */
import { BellRing, Check, Flame } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/index.js';
import { cn } from '../../lib/cn.js';
import { HabitIcon } from '../habits/HabitIcon.jsx';
import { scheduleSummary, streakLabel } from '../habits/schedule.js';
import { useToggleCompletion } from './useToggleCompletion.js';

const TOGGLE_STYLES = {
  done: 'border-status-completed bg-status-completed text-on-completed',
  open: 'border-border text-transparent hover:border-status-completed hover:text-status-completed/40',
  missed: 'border-dashed border-status-missed text-transparent hover:text-status-missed/50',
};

/**
 * @param {{ item: object, date: string, readOnly: boolean,
 *   focusRequestRef: import('react').MutableRefObject<string | null> }} props item = one entry of
 *   GET /today `habits`; focusRequestRef = id of the habit whose toggle should regain focus
 */
export function HabitRow({ item, date, readOnly, focusRequestRef }) {
  const { habit, completed, status, isDue, streak, weekProgress } = item;
  const { toggle, isPending } = useToggleCompletion(habit, date);
  const buttonRef = useRef(null);

  // On (re)mount after a move between groups: restore focus if it was on this habit's toggle.
  useEffect(() => {
    if (focusRequestRef?.current !== habit.id) return;
    // Focus is "lost" when it fell back to <body>, or (some environments) still points at the
    // removed old button.
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    if (lost) buttonRef.current?.focus();
    focusRequestRef.current = null;
  }, [focusRequestRef, habit.id]);

  const unavailable = readOnly || isPending;

  function onToggle(event) {
    if (unavailable) return;
    // If the toggle has focus, ask the row's next incarnation (after it moves group) to take it.
    if (focusRequestRef && document.activeElement === event.currentTarget) {
      focusRequestRef.current = habit.id;
    }
    toggle(!completed);
  }
  const streakText = streakLabel(streak);
  const weekMet = !completed && status === 'completed'; // weekly target already reached

  let look = 'open';
  if (completed) look = 'done';
  else if (status === 'missed') look = 'missed';

  return (
    <li className="flex items-center gap-3 py-3">
      <HabitIcon icon={habit.icon} color={habit.color} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/habits/${habit.id}`}
            className={cn('font-medium text-fg hover:underline', completed && 'text-fg-muted')}
          >
            {habit.name}
          </Link>
          {habit.category && <Badge>{habit.category}</Badge>}
          {isDue && (
            <Badge tone="brand">
              <BellRing aria-hidden="true" className="h-3 w-3" />
              Due now
            </Badge>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
          <span>{scheduleSummary(habit, weekProgress)}</span>
          {streakText && (
            <span className="inline-flex items-center gap-1">
              <Flame aria-hidden="true" className="h-3.5 w-3.5 text-orange-500" />
              <span className="sr-only">Current streak:</span>
              {streakText}
            </span>
          )}
          {weekMet && <span className="text-status-completed">Week target met</span>}
        </p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={completed}
        aria-label={`Mark ${habit.name} complete`}
        aria-disabled={unavailable || undefined}
        aria-describedby={readOnly ? 'future-day-note' : undefined}
        onClick={onToggle}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
          TOGGLE_STYLES[look],
        )}
      >
        <Check aria-hidden="true" className="h-5 w-5" strokeWidth={3} />
      </button>
    </li>
  );
}
