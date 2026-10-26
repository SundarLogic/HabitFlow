/**
 * Year heatmap (GitHub style): one cell per day for the last 365 days, columns = ISO weeks,
 * rows = Mon..Sun, colour = share of the day's scheduled habits completed.
 * Data: GET /analytics/heatmap (day-based habits; docs/STREAK_RULES.md §8).
 *
 * Keyboard (ARIA grid pattern with a roving tab stop, so 365 cells cost ONE Tab press):
 *   Tab focuses the grid's active cell; ←/→ move a week, ↑/↓ a day; Home/End jump to the first
 *   and last day. Each cell's name says everything ("Mon 26 Oct: 2 of 3 done"), and the focused
 *   or hovered day is also described in the line under the grid (the "tooltip").
 * Colour is never the only signal: the details are always text.
 */
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useRef, useState } from 'react';
import { Card, Skeleton } from '../../components/ui/index.js';
import { cn } from '../../lib/cn.js';
import { addDays } from '../../lib/dates.js';
import { queryKeys } from '../../lib/queryClient.js';
import { fetchHeatmap } from './api.js';

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const LEVELS = [
  'bg-surface-muted', // nothing due
  'border border-border bg-surface-raised', // due, none done
  'bg-status-completed/30',
  'bg-status-completed/55',
  'bg-status-completed/80',
  'bg-status-completed',
];

/** Colour level 0..5 for a day. */
function levelOf({ completed, scheduled }) {
  if (scheduled === 0) return 0;
  const ratio = completed / scheduled;
  if (ratio === 0) return 1;
  if (ratio <= 0.25) return 2;
  if (ratio <= 0.5) return 3;
  if (ratio < 1) return 4;
  return 5;
}

function describe(day) {
  const label = DateTime.fromISO(day.date).toLocaleString({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (day.future) return `${label}: upcoming`;
  if (day.scheduled === 0) return `${label}: nothing due`;
  return `${label}: ${day.completed} of ${day.scheduled} done`;
}

/** @param {{ today: string }} props */
export function Heatmap({ today }) {
  const from = addDays(today, -364);
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.heatmap(from, today),
    queryFn: () => fetchHeatmap({ from, to: today }),
  });
  const days = data?.data ?? [];
  const [activeIndex, setActiveIndex] = useState(null);
  const [detail, setDetail] = useState(null);
  const cellRefs = useRef([]);

  // Weeks as columns: pad the first column so rows line up with Monday..Sunday.
  const leading = days.length ? DateTime.fromISO(days[0].date).weekday - 1 : 0;
  const columns = Math.ceil((leading + days.length) / 7);

  const current = activeIndex ?? days.length - 1; // the tab stop: today by default

  function focusCell(index) {
    const clamped = Math.min(days.length - 1, Math.max(0, index));
    setActiveIndex(clamped);
    setDetail(describe(days[clamped]));
    cellRefs.current[clamped]?.focus();
  }

  function onKeyDown(event) {
    const moves = {
      ArrowRight: current + 7,
      ArrowLeft: current - 7,
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: days.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusCell(moves[event.key]);
  }

  return (
    <Card as="section" aria-labelledby="heatmap-title">
      <h2 id="heatmap-title" className="text-base font-semibold text-fg">
        Last 12 months
      </h2>
      <p className="mt-0.5 text-sm text-fg-muted">
        All daily and specific-day habits. Use the arrow keys to move between days.
      </p>
      {isPending && <Skeleton className="mt-4 h-32 w-full" />}
      {isError && <p className="mt-4 text-sm text-fg-muted">Couldn't load the heatmap.</p>}
      {days.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto pb-2">
            {/* Real rows (not display: contents, which some browsers drop from the a11y tree);
                fixed 12 px cells keep the week columns aligned. */}
            <div
              role="grid"
              aria-labelledby="heatmap-title"
              onKeyDown={onKeyDown}
              className="inline-flex flex-col gap-[3px]"
            >
              {WEEKDAY_LABELS.map((label, row) => (
                <div key={row} role="row" className="flex gap-[3px]">
                  <span
                    role="rowheader"
                    className="w-8 shrink-0 pr-1 text-[10px] leading-3 text-fg-muted"
                  >
                    {label}
                  </span>
                  {Array.from({ length: columns }, (_, col) => {
                    const index = col * 7 + row - leading;
                    const day = days[index];
                    if (!day)
                      return <span key={col} role="presentation" className="h-3 w-3 shrink-0" />;
                    const future = day.date > today;
                    return (
                      <span
                        key={col}
                        ref={(el) => {
                          cellRefs.current[index] = el;
                        }}
                        role="gridcell"
                        tabIndex={index === current ? 0 : -1}
                        aria-label={describe({ ...day, future })}
                        onFocus={() => setDetail(describe({ ...day, future }))}
                        onMouseEnter={() => setDetail(describe({ ...day, future }))}
                        onClick={() => focusCell(index)}
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-[3px] outline-offset-1',
                          future ? 'bg-transparent' : LEVELS[levelOf(day)],
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <p aria-hidden="true" className="min-h-4">
              {detail ?? 'Hover or focus a day to see its details.'}
            </p>
            <div aria-hidden="true" className="flex items-center gap-1">
              Less
              {[0, 1, 2, 3, 4, 5].map((level) => (
                <span key={level} className={cn('h-3 w-3 rounded-[3px]', LEVELS[level])} />
              ))}
              More
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
