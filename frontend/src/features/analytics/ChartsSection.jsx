/**
 * The four Analytics charts, laid out in a grid. Default export so AnalyticsPage can lazy-load it:
 * Recharts is the largest library in the app (~100 kB gzipped), and splitting it out lets the stat
 * cards, heatmap and history appear before the charts' code has downloaded (Phase 11, Lighthouse).
 */
import { ByCategoryChart, ByHabitChart, DailyRateChart, WeeklyChart } from './Charts.jsx';

/**
 * @param {{ summary: object, habitId?: string }} props summary from GET /analytics/summary;
 *   with a habit selected, the per-habit chart is replaced by that habit's categories
 */
export default function ChartsSection({ summary, habitId }) {
  return (
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
          <ByCategoryChart byCategory={summary.byCategory.filter((c) => c.scheduled > 0)} />
        </div>
      )}
    </div>
  );
}
