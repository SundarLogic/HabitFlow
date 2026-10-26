/**
 * Analytics (/analytics): "Review progress" (PRD 4.5).
 *
 * Filters live in the URL (shareable, survive reloads): ?range=7d|30d|90d|year|custom
 * (&from&to for custom, at most 366 days) and ?habit=<id>.
 * Data: GET /analytics/summary (stat cards and charts), GET /analytics/heatmap (last 12 months)
 * and GET /completions (history list).
 *
 * A null completion rate means nothing was due in the period: it shows an empty state, never 0%
 * (CLAUDE.md §3.1, docs/STREAK_RULES.md §8).
 */
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarCheck, Flame, Percent, Target } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import {
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
} from '../components/ui/index.js';
import { fetchSummary } from '../features/analytics/api.js';
import { formatRate } from '../features/analytics/ChartFigure.jsx';
import {
  ByCategoryChart,
  ByHabitChart,
  DailyRateChart,
  WeeklyChart,
} from '../features/analytics/Charts.jsx';
import { Heatmap } from '../features/analytics/Heatmap.jsx';
import { HistoryList } from '../features/analytics/HistoryList.jsx';
import { RANGE_PRESETS, resolveRange } from '../features/analytics/ranges.js';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { listHabits } from '../features/habits/api.js';
import { todayIn } from '../lib/dates.js';
import { queryKeys } from '../lib/queryClient.js';

export function AnalyticsPage() {
  const { user } = useAuth();
  const today = todayIn(user?.timezone);
  const [params, setParams] = useSearchParams();
  const range = resolveRange(params, today);
  const habitId = params.get('habit') || undefined;

  /** Updates some URL parameters, keeping the others (replace: filters aren't history steps). */
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const habitsQuery = useQuery({
    queryKey: queryKeys.habits({ status: 'all' }),
    queryFn: () => listHabits({ status: 'all' }),
  });
  const habits = habitsQuery.data ?? [];
  const habitNames = new Map(habits.map((h) => [h.id, h.name]));

  const summaryQuery = useQuery({
    queryKey: queryKeys.analyticsSummary(range.from, range.to, habitId),
    queryFn: () => fetchSummary({ from: range.from, to: range.to, habitId }),
  });
  const summary = summaryQuery.data;
  const bestCurrent = summary?.byHabit.reduce(
    (best, h) => (h.currentStreak > (best?.currentStreak ?? 0) ? h : best),
    null,
  );
  const noData = summary && summary.overall.completionRate === null;

  return (
    <>
      <PageHeader title="Analytics" description="How your habits are going over time." />
      <div className="space-y-5">
        <Card className="space-y-4">
          <SegmentedControl
            legend="Period"
            name="range"
            options={RANGE_PRESETS}
            value={range.preset}
            onChange={(value) =>
              update(
                value === 'custom'
                  ? { range: value, from: range.from, to: range.to }
                  : { range: value, from: null, to: null },
              )
            }
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {range.preset === 'custom' && (
              <>
                <FormField label="From" className="sm:w-44">
                  {(field) => (
                    <Input
                      type="date"
                      max={today}
                      {...field}
                      value={params.get('from') ?? range.from}
                      onChange={(e) => update({ from: e.target.value })}
                    />
                  )}
                </FormField>
                <FormField label="To" className="sm:w-44">
                  {(field) => (
                    <Input
                      type="date"
                      max={today}
                      {...field}
                      value={params.get('to') ?? range.to}
                      onChange={(e) => update({ to: e.target.value })}
                    />
                  )}
                </FormField>
              </>
            )}
            <FormField label="Habit" className="sm:w-64">
              {(field) => (
                <Select
                  {...field}
                  value={habitId ?? ''}
                  onChange={(e) => update({ habit: e.target.value })}
                >
                  <option value="">All habits</option>
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.status === 'archived' ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
          {range.error && (
            <p role="alert" className="text-sm text-danger">
              {range.error} Showing the last 30 days instead.
            </p>
          )}
        </Card>

        {summaryQuery.isPending && (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {summaryQuery.isError && (
          <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
        )}

        {summary && (
          <>
            <StatGrid>
              <StatCard
                icon={Percent}
                label="Completion rate"
                value={formatRate(summary.overall.completionRate)}
                hint={noData ? 'Nothing was due yet' : `${range.from} – ${range.to}`}
              />
              <StatCard
                icon={Target}
                label="Completed"
                value={`${summary.overall.completed} / ${summary.overall.scheduled}`}
                hint="done / due"
              />
              <StatCard
                icon={Flame}
                label="Best current streak"
                value={
                  bestCurrent
                    ? `${bestCurrent.currentStreak} ${bestCurrent.unit === 'weeks' ? 'wk' : 'd'}`
                    : '—'
                }
                hint={bestCurrent?.name ?? 'Tick a habit to start one'}
              />
              <StatCard
                icon={CalendarCheck}
                label="Today"
                value={`${summary.today.completed} / ${summary.today.scheduled}`}
                hint={
                  summary.today.percent === null
                    ? 'Nothing due today'
                    : `${summary.today.percent}% done`
                }
              />
            </StatGrid>

            {noData ? (
              <Card>
                <EmptyState
                  icon={BarChart3}
                  title="No scheduled habits in this period"
                  description="Pick a longer period, or come back after your habits have been due for a few days."
                />
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <DailyRateChart daily={summary.daily} />
                </div>
                <WeeklyChart weekly={summary.weekly} />
                {habitId ? (
                  <ByCategoryChart byCategory={summary.byCategory} />
                ) : (
                  <ByHabitChart byHabit={summary.byHabit.filter((h) => h.scheduled > 0)} />
                )}
                {!habitId && (
                  <div className="lg:col-span-2">
                    <ByCategoryChart
                      byCategory={summary.byCategory.filter((c) => c.scheduled > 0)}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Heatmap today={today} />
        <HistoryList from={range.from} to={range.to} habitId={habitId} habitNames={habitNames} />
      </div>
    </>
  );
}
