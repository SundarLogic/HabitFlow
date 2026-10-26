/**
 * Habit detail (/habits/:id): everything about one habit.
 *   header     name, schedule, category, archived badge; Edit and Archive/Restore
 *   stats      current streak, longest streak, last-30-days completion rate, completions
 *   calendar   month view; click a past or today's day to toggle it (optimistic)
 *   notes      a note for today's completion + recent notes
 *   reminders  the user's reminder times for this habit
 * Data: GET /habits/:id (habit + streaks), /analytics/summary?habitId (30-day rate),
 * /completions?habitId (count + notes), /habits/:id/history (calendar), /habits/:id/reminders.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Flame,
  Pencil,
  Percent,
  Trophy,
} from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  StatGrid,
} from '../components/ui/index.js';
import { fetchSummary } from '../features/analytics/api.js';
import { formatRate } from '../features/analytics/ChartFigure.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { getHabit, listCompletions } from '../features/habits/api.js';
import { MonthCalendar } from '../features/habits/detail/MonthCalendar.jsx';
import { NotesCard } from '../features/habits/detail/NotesCard.jsx';
import { RemindersEditor } from '../features/habits/detail/RemindersEditor.jsx';
import { HabitIcon } from '../features/habits/HabitIcon.jsx';
import { useHabitForm } from '../features/habits/HabitFormProvider.jsx';
import { scheduleSummary } from '../features/habits/schedule.js';
import { useHabitActions } from '../features/habits/useHabitActions.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { addDays, todayIn } from '../lib/dates.js';
import { queryKeys } from '../lib/queryClient.js';

/** A titled section card. */
function Section({ id, title, children }) {
  return (
    <Card as="section" aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-base font-semibold text-fg">
        {title}
      </h2>
      {children}
    </Card>
  );
}

const unitLabel = (n, unit) => `${n} ${unit === 'weeks' ? 'week' : 'day'}${n === 1 ? '' : 's'}`;

export function HabitDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openEdit } = useHabitForm();
  const { archive, unarchive } = useHabitActions();
  const today = todayIn(user?.timezone);

  const detailQuery = useQuery({
    queryKey: [...queryKeys.habit(id), 'detail'],
    queryFn: () => getHabit(id),
  });
  const habit = detailQuery.data?.habit;
  // The tab title also covers the loading and "not found" states, which have no PageHeader.
  usePageTitle(detailQuery.isError ? 'Habit not found' : (habit?.name ?? 'Habit'));

  // The API caps history ranges at 366 days, so "completions" covers at most the last year.
  const yearAgo = addDays(today, -365);
  const countFrom = habit && habit.startDate > yearAgo ? habit.startDate : yearAgo;
  const completionsQuery = useQuery({
    queryKey: queryKeys.completions({ habitId: id, from: countFrom, to: today, limit: 100 }),
    queryFn: () => listCompletions({ habitId: id, from: countFrom, to: today, limit: 100 }),
    enabled: Boolean(habit) && countFrom <= today,
  });
  const rateFrom = addDays(today, -29);
  const rateQuery = useQuery({
    queryKey: queryKeys.analyticsSummary(rateFrom, today, id),
    queryFn: () => fetchSummary({ from: rateFrom, to: today, habitId: id }),
    enabled: Boolean(habit),
  });

  if (detailQuery.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (detailQuery.isError) {
    return detailQuery.error.status === 404 ? (
      <EmptyState
        headingLevel={1}
        title="Habit not found"
        description="It may have been deleted, or it belongs to another workspace."
        action={
          <Link
            to="/habits"
            className="font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Back to habits
          </Link>
        }
      />
    ) : (
      <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
    );
  }

  const { streaks } = detailQuery.data;
  const archived = habit.status === 'archived';
  const rate = rateQuery.data?.byHabit[0]?.completionRate;
  const total = completionsQuery.data?.meta.total;

  return (
    <>
      <Link
        to="/habits"
        className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All habits
      </Link>
      <div className="flex items-start gap-3">
        <HabitIcon icon={habit.icon} color={habit.color} className="mt-1" />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={habit.name}
            description={
              <span className="flex flex-wrap items-center gap-2">
                {scheduleSummary(habit, streaks.weekProgress)}
                {habit.category && <Badge>{habit.category}</Badge>}
                {archived && <Badge tone="unscheduled">Archived</Badge>}
              </span>
            }
            actions={
              archived ? (
                <Button
                  variant="secondary"
                  loading={unarchive.isPending}
                  onClick={() => unarchive.mutate(habit)}
                >
                  <ArchiveRestore aria-hidden="true" className="h-4 w-4" /> Restore
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => openEdit(habit)}>
                    <Pencil aria-hidden="true" className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="secondary"
                    loading={archive.isPending}
                    onClick={() => archive.mutate(habit)}
                  >
                    <Archive aria-hidden="true" className="h-4 w-4" /> Archive
                  </Button>
                </>
              )
            }
          />
        </div>
      </div>
      {habit.description && <p className="-mt-3 mb-5 text-sm text-fg-muted">{habit.description}</p>}

      <div className="space-y-5">
        <StatGrid>
          <StatCard
            icon={Flame}
            label="Current streak"
            value={unitLabel(streaks.current, streaks.unit)}
          />
          <StatCard
            icon={Trophy}
            label="Longest streak"
            value={unitLabel(streaks.longest, streaks.unit)}
          />
          <StatCard
            icon={Percent}
            label="Completion rate"
            value={rateQuery.isPending ? '…' : formatRate(rate)}
            hint={rate === null ? 'Nothing due in the last 30 days' : 'Last 30 days'}
          />
          <StatCard
            icon={CheckCircle2}
            label="Completions"
            value={total ?? '…'}
            hint={countFrom === habit.startDate ? 'Since you started' : 'Last 12 months'}
          />
        </StatGrid>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Section id="calendar-title" title="Calendar">
            <MonthCalendar habit={habit} today={today} readOnly={archived} />
          </Section>
          <div className="space-y-5">
            <Section id="notes-title" title="Notes">
              <NotesCard
                key={completionsQuery.dataUpdatedAt}
                habit={habit}
                today={today}
                completions={completionsQuery.data?.data ?? []}
                readOnly={archived}
              />
            </Section>
            <Section id="reminders-title" title="Reminders">
              <RemindersEditor habit={habit} readOnly={archived} />
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
