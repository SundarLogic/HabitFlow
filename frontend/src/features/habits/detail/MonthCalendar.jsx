/**
 * Month calendar for one habit (GET /habits/:id/history), where clicking a day toggles its
 * completion, with the same optimistic approach as Today (ADR-047):
 *   the day changes at once -> on error it flips back with a toast -> afterwards all habit data
 *   (streaks, rates, Today) is refetched from the server.
 *
 * Only days that can be completed are buttons: completed / pending / missed days of an ACTIVE
 * habit. Not-scheduled, upcoming and pre-start days are plain cells. Each day button is a toggle
 * (aria-pressed) whose name includes the date and its status ("Mon, Oct 26: missed").
 * Colours follow the never-punitive palette (missed = soft stone).
 */
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { IconButton, Skeleton, useToast } from '../../../components/ui/index.js';
import { cn } from '../../../lib/cn.js';
import { reportMutationError } from '../../../lib/mutationErrors.js';
import { HABIT_DATA_FAMILIES, queryKeys } from '../../../lib/queryClient.js';
import { WEEKDAYS } from '../constants.js';
import { getHabitHistory, markComplete, unmarkComplete } from '../api.js';

const TOGGLEABLE = new Set(['completed', 'pending', 'missed']);
const STATUS_TEXT = {
  completed: 'done',
  pending: 'not done yet',
  missed: 'missed',
  not_scheduled: 'not scheduled',
  upcoming: 'upcoming',
};
const STATUS_STYLE = {
  completed: 'bg-status-completed text-on-completed',
  pending: 'border-2 border-border text-fg',
  missed: 'border-2 border-dashed border-status-missed text-status-missed',
  not_scheduled: 'text-status-unscheduled',
  upcoming: 'text-fg-muted', // full strength: day numbers are text and need 4.5:1 contrast
};

/** One clickable day. Its own mutation, keyed like Today's so both screens share pending state. */
function DayButton({ habit, day, historyKey, today, label }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutationKey = ['toggle-completion', habit.id, day.date];
  const inFlight = useIsMutating({ mutationKey }) > 0;

  /** Patches one day in the cached history (used for the optimistic change and its undo). */
  const patch = (done) =>
    queryClient.setQueryData(
      historyKey,
      (old) =>
        old && {
          ...old,
          data: old.data.map((d) =>
            d.date === day.date
              ? {
                  ...d,
                  completed: done,
                  status: done ? 'completed' : d.date === today ? 'pending' : 'missed',
                }
              : d,
          ),
        },
    );

  const mutation = useMutation({
    mutationKey,
    mutationFn: (done) =>
      done ? markComplete(habit.id, day.date) : unmarkComplete(habit.id, day.date),
    onMutate: async (done) => {
      await queryClient.cancelQueries({ queryKey: historyKey });
      patch(done);
    },
    onError: (error, done) => {
      patch(!done);
      reportMutationError(toast, `Couldn't update ${label}`, error, () => mutation.mutate(done));
    },
    onSettled: () =>
      Promise.all(
        HABIT_DATA_FAMILIES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return (
    <button
      type="button"
      aria-pressed={day.completed}
      aria-label={`${label}: ${STATUS_TEXT[day.status]}`}
      aria-disabled={inFlight || undefined}
      onClick={() => !inFlight && mutation.mutate(!day.completed)}
      className={cn(
        'flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium sm:h-11',
        'hover:ring-2 hover:ring-status-completed/40 aria-disabled:opacity-60',
        STATUS_STYLE[day.status],
        day.date === today && 'font-bold underline underline-offset-4',
      )}
    >
      {DateTime.fromISO(day.date).day}
    </button>
  );
}

/**
 * @param {{ habit: object, today: string, readOnly: boolean }} props readOnly for archived habits
 */
export function MonthCalendar({ habit, today, readOnly }) {
  const [month, setMonth] = useState(() => DateTime.fromISO(today).startOf('month'));
  const from = month.toISODate();
  const to = month.endOf('month').toISODate();
  const historyKey = queryKeys.habitHistory(habit.id, from, to);
  const { data, isPending, isError } = useQuery({
    queryKey: historyKey,
    queryFn: () => getHabitHistory(habit.id, { from, to }),
  });
  const isCurrentMonth = month.hasSame(DateTime.fromISO(today), 'month');
  const title = month.toLocaleString({ month: 'long', year: 'numeric' });

  // Weeks as rows (Mon..Sun); null = padding before the 1st / after the last day.
  const days = data?.data ?? [];
  const lead = month.weekday - 1;
  const cells = [...Array(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <IconButton
          label="Previous month"
          icon={ChevronLeft}
          variant="secondary"
          size="sm"
          onClick={() => setMonth(month.minus({ months: 1 }))}
        />
        <h3 aria-live="polite" className="text-sm font-semibold text-fg">
          {title}
        </h3>
        <IconButton
          label="Next month"
          icon={ChevronRight}
          variant="secondary"
          size="sm"
          disabled={isCurrentMonth}
          onClick={() => setMonth(month.plus({ months: 1 }))}
        />
      </div>
      {isPending && <Skeleton className="h-64 w-full" />}
      {isError && <p className="text-sm text-fg-muted">Couldn't load this month.</p>}
      {data && (
        <table className="w-full table-fixed border-separate border-spacing-1">
          <caption className="sr-only">
            {habit.name}, {title}.{' '}
            {readOnly ? 'Read-only.' : 'Select a day to mark it done or not done.'}
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day.value} scope="col" className="text-xs font-medium text-fg-muted">
                  <abbr title={day.long} className="no-underline">
                    {day.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.find(Boolean)?.date}>
                {week.map((day, i) => {
                  if (!day) return <td key={i} />;
                  const label = DateTime.fromISO(day.date).toLocaleString({
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                  const toggleable = !readOnly && TOGGLEABLE.has(day.status);
                  return (
                    <td key={day.date}>
                      {toggleable ? (
                        <DayButton
                          habit={habit}
                          day={day}
                          historyKey={historyKey}
                          today={today}
                          label={label}
                        />
                      ) : (
                        <span
                          aria-label={`${label}: ${STATUS_TEXT[day.status]}`}
                          className={cn(
                            'flex h-10 w-full items-center justify-center rounded-lg text-sm sm:h-11',
                            STATUS_STYLE[day.status],
                          )}
                        >
                          {DateTime.fromISO(day.date).day}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
