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
            const label = DateTime.fromISO(day.date).toLocaleString({
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            const detail =
              percent === null
                ? 'nothing due'
                : `${day.completed} of ${day.scheduled} done, ${percent}%`;
            return (
              <li key={day.date}>
                <button
                  type="button"
                  onClick={() => onSelect(day.date)}
                  aria-label={`${label}: ${detail}`}
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
                  <span aria-hidden="true" className="text-xs text-fg-muted">
                    {shortWeekday(day.date)}
                  </span>
                  <span aria-hidden="true" className="text-xs font-medium text-fg">
                    {percent === null ? '–' : `${percent}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
