/**
 * The four Analytics charts (Recharts), each in a ChartFigure with a data table:
 *   DailyRateChart     completion rate per day (bars)
 *   WeeklyChart        completion rate per ISO week (bars)
 *   ByHabitChart       completion rate per habit (horizontal bars)
 *   ByCategoryChart    completion rate per category (horizontal bars)
 * Colours come from the design tokens (CSS variables), so they follow light/dark mode.
 * Days or weeks with nothing due have no bar (a gap), never a 0% bar: not having anything to do
 * isn't a failure.
 */
import { DateTime } from 'luxon';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFigure, formatRate } from './ChartFigure.jsx';

const BAR = 'var(--hf-completed)';
const GRID = 'var(--hf-border)';
const TICK = { fill: 'var(--hf-fg-muted)', fontSize: 12 };
const toPercent = (rate) => (rate === null ? null : Math.round(rate * 100));
const shortDate = (iso) => DateTime.fromISO(iso).toLocaleString({ month: 'short', day: 'numeric' });

/** Tooltip in the app's style ("Oct 28: 67% (2 of 3)"). */
function RateTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-fg">{item.label}</p>
      <p className="text-fg-muted">
        {item.percent === null
          ? 'Nothing due'
          : `${item.percent}% (${item.completed} of ${item.scheduled})`}
      </p>
    </div>
  );
}

function PercentBars({ data, horizontal = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 8 : -16 }}
      >
        <CartesianGrid
          stroke={GRID}
          strokeDasharray="3 3"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis type="number" domain={[0, 100]} unit="%" tick={TICK} />
            <YAxis type="category" dataKey="label" width={110} tick={TICK} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={TICK} minTickGap={16} />
            <YAxis domain={[0, 100]} unit="%" tick={TICK} />
          </>
        )}
        <Tooltip content={<RateTooltip />} cursor={{ fill: 'var(--hf-surface-muted)' }} />
        <Bar dataKey="percent" fill={BAR} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const rowFor = (item) => [
  item.label,
  formatRate(item.rate),
  `${item.completed} of ${item.scheduled}`,
];
const COLUMNS = (first) => [first, 'Rate', 'Completed'];

export function DailyRateChart({ daily }) {
  const data = daily.map((d) => ({ ...d, label: shortDate(d.date), percent: toPercent(d.rate) }));
  return (
    <ChartFigure
      title="Daily completion rate"
      description="Daily and specific-day habits; today counts once you've finished it."
      columns={COLUMNS('Date')}
      rows={data.map(rowFor)}
    >
      <PercentBars data={data} />
    </ChartFigure>
  );
}

export function WeeklyChart({ weekly }) {
  const data = weekly.map((w) => ({
    ...w,
    label: `Week of ${shortDate(w.weekStart)}`,
    percent: toPercent(w.rate),
  }));
  return (
    <ChartFigure title="Weekly completion rate" columns={COLUMNS('Week')} rows={data.map(rowFor)}>
      <PercentBars data={data.map((d) => ({ ...d, label: shortDate(d.weekStart) }))} />
    </ChartFigure>
  );
}

export function ByHabitChart({ byHabit }) {
  const data = byHabit.map((h) => ({
    label: h.name,
    rate: h.completionRate,
    percent: toPercent(h.completionRate),
    completed: h.completed,
    scheduled: h.scheduled,
  }));
  return (
    <ChartFigure
      title="By habit"
      columns={COLUMNS('Habit')}
      rows={data.map(rowFor)}
      height={Math.max(160, data.length * 36)}
    >
      <PercentBars data={data} horizontal />
    </ChartFigure>
  );
}

export function ByCategoryChart({ byCategory }) {
  const data = byCategory.map((c) => ({
    label: c.category ?? 'Uncategorized',
    rate: c.completionRate,
    percent: toPercent(c.completionRate),
    completed: c.completed,
    scheduled: c.scheduled,
  }));
  return (
    <ChartFigure
      title="By category"
      columns={COLUMNS('Category')}
      rows={data.map(rowFor)}
      height={Math.max(140, data.length * 36)}
    >
      <PercentBars data={data} horizontal />
    </ChartFigure>
  );
}
