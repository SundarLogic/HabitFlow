/**
 * The last 7 days as small bars (completion % of day-based habits per day), from
 * GET /analytics/summary's `daily` series. Each bar is a button that opens that day.
 *
 * Counts follow the analytics rules (docs/STREAK_RULES.md §8): today's unfinished habits don't
 * count against it yet, and weekly-target habits are measured per week, not per day.
 * Accessibility: every bar's button name states the numbers ("Wed 28 Oct: 2 of 3 done, 67%");
 * the bar heights are decoration.
 */
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Card, Skeleton } from '../../components/ui/index.js';
import { cn } from '../../lib/cn.js';
import { addDays, shortWeekday } from '../../lib/dates.js';
import { queryKeys } from '../../lib/queryClient.js';
import { api } from '../../services/apiClient.js';

async function fetchSummary(from, to) {
  const { data } = await api.get('/analytics/summary', { params: { from, to } });
  return data;
}

/**
 * @param {{ today: string, selected: string, onSelect: (date: string) => void }} props
 */
export function WeeklyStrip({ today, selected, onSelect }) {
  const from = addDays(today, -6);
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.analyticsSummary(from, today),
    queryFn: () => fetchSummary(from, today),
  });

  return (
    <Card as="section" aria-labelledby="week-strip-title">
      <h2 id="week-strip-title" className="text-sm font-semibold text-fg">
        Last 7 days
      </h2>
      {isPending && <Skeleton className="mt-3 h-24 w-full" />}
      {isError && <p className="mt-3 text-sm text-fg-muted">Couldn't load your week.</p>}
      {data && (
        <ol className="mt-3 grid grid-cols-7 gap-1.5">
          {data.daily.map((day) => {
            const percent = day.rate === null ? null : Math.round(day.rate * 100);
            // The name STARTS with exactly what is visible ("Tue 50%"), then adds the details:
            // "Tue 50%: Oct 20, 1 of 2 done". WCAG 2.5.3 Label in Name: speech users can say
            // "click Tue" (Phase 11, ADR-054).
            const weekday = shortWeekday(day.date);
            const monthDay = DateTime.fromISO(day.date).toLocaleString({
              day: 'numeric',
              month: 'short',
            });
            const name =
              percent === null
                ? `${weekday}: ${monthDay}, nothing due`
                : `${weekday} ${percent}%: ${monthDay}, ${day.completed} of ${day.scheduled} done`;
            return (
              <li key={day.date}>
                <button
                  type="button"
                  onClick={() => onSelect(day.date)}
                  aria-label={name}
                  aria-current={day.date === selected ? 'date' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-lg p-1 hover:bg-surface-muted',
                    day.date === selected && 'bg-surface-muted',
                  )}
                >
                  <span aria-hidden="true" className="flex h-16 w-full items-end justify-center">
                    <span
                      className={cn(
                        'w-full max-w-6 rounded-t-md',
                        percent === null ? 'h-1 bg-border' : 'bg-status-completed',
                      )}
                      style={percent === null ? undefined : { height: `${Math.max(percent, 6)}%` }}
                    />
                  </span>
                  <span className="text-xs text-fg-muted">{weekday}</span>
                  {/* A real space between the two texts, so the visible text reads "Tue 50%" (as in
                      the name) and not "Tue50%"; flex layout ignores it. */}{' '}
                  {percent === null ? (
                    <span aria-hidden="true" className="text-xs font-medium text-fg">
                      –
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-fg">{percent}%</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
