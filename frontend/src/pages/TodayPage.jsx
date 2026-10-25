/**
 * Today (/): the daily loop. See what's due, tick it off in one tap, glance at progress.
 *
 *   ?date=YYYY-MM-DD   the day shown (default: today in the user's timezone). Past days are
 *                      editable (back-filling is allowed); future days are read-only.
 *   ← / →              previous / next day;  n  new habit
 *
 * Data: GET /today?date (scheduled habits + statuses + summary) and the active habit list (for
 * the "Not scheduled today" section and to tell a brand-new user from "nothing due today").
 * Ticking a habit is optimistic (useToggleCompletion): the UI changes before the server answers.
 */
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus } from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui/index.js';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { listHabits } from '../features/habits/api.js';
import { HabitIcon } from '../features/habits/HabitIcon.jsx';
import { useHabitForm } from '../features/habits/HabitFormProvider.jsx';
import { scheduleSummary } from '../features/habits/schedule.js';
import { fetchToday } from '../features/today/api.js';
import { DateNavigator } from '../features/today/DateNavigator.jsx';
import { GetStarted } from '../features/today/GetStarted.jsx';
import { HabitRow } from '../features/today/HabitRow.jsx';
import { ProgressSummary } from '../features/today/ProgressSummary.jsx';
import { WeeklyStrip } from '../features/today/WeeklyStrip.jsx';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { addDays, isIsoDate, longDate, relativeDayLabel, todayIn } from '../lib/dates.js';
import { queryKeys } from '../lib/queryClient.js';

function TodaySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your habits
      </p>
      <Skeleton className="h-24 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** A titled group of habit rows ("To do", "Done"). */
function HabitGroup({ id, title, items, date, readOnly, focusRequestRef }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 text-sm font-semibold text-fg-muted">
        {title} <span className="font-normal">({items.length})</span>
      </h2>
      <Card className="py-0 sm:py-0">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <HabitRow
              key={item.habit.id}
              item={item}
              date={date}
              readOnly={readOnly}
              focusRequestRef={focusRequestRef}
            />
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function TodayPage() {
  const { user } = useAuth();
  const { openCreate } = useHabitForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayIn(user?.timezone);
  const requested = searchParams.get('date');
  const date = isIsoDate(requested) ? requested : today;
  const isToday = date === today;
  const isFuture = date > today;
  // Which habit's toggle should get focus back after its row moves between groups.
  const focusRequestRef = useRef(null);

  const setDate = (next) => {
    // Today is the default, so keep the URL clean for it. `replace` avoids one history entry
    // per click when stepping through days.
    setSearchParams(next === today ? {} : { date: next }, { replace: true });
  };
  useKeyboardShortcuts({
    ArrowLeft: () => setDate(addDays(date, -1)),
    ArrowRight: () => date < today && setDate(addDays(date, 1)),
    n: openCreate,
  });

  const todayQuery = useQuery({ queryKey: queryKeys.today(date), queryFn: () => fetchToday(date) });
  const habitsQuery = useQuery({
    queryKey: queryKeys.habits({ status: 'active' }),
    queryFn: () => listHabits({ status: 'active' }),
  });

  const relative = relativeDayLabel(date, today);
  const title = relative ?? longDate(date);
  const data = todayQuery.data;
  const scheduledIds = new Set(data?.habits.map((item) => item.habit.id));
  const notScheduled = (habitsQuery.data ?? []).filter((habit) => !scheduledIds.has(habit.id));
  const isNewUser = habitsQuery.data?.length === 0;
  const toDo = data?.habits.filter((item) => item.status !== 'completed') ?? [];
  const done = data?.habits.filter((item) => item.status === 'completed') ?? [];

  return (
    <>
      <PageHeader
        title={title}
        description={relative ? longDate(date) : undefined}
        actions={
          <Button onClick={openCreate} aria-keyshortcuts="n">
            <Plus aria-hidden="true" className="h-4 w-4" />
            New habit
          </Button>
        }
      />
      <div className="space-y-5">
        <DateNavigator date={date} today={today} onChange={setDate} />
        <p className="hidden text-xs text-fg-muted md:block">
          Tip: press <kbd className="font-sans font-semibold">←</kbd> /{' '}
          <kbd className="font-sans font-semibold">→</kbd> to change the day and{' '}
          <kbd className="font-sans font-semibold">N</kbd> to add a habit.
        </p>

        {isFuture && (
          <p
            id="future-day-note"
            role="note"
            className="rounded-lg bg-surface-muted p-3 text-sm text-fg-muted"
          >
            This day hasn't happened yet. You can tick habits off once it arrives.
          </p>
        )}

        {todayQuery.isPending && <TodaySkeleton />}
        {todayQuery.isError && (
          <ErrorState error={todayQuery.error} onRetry={() => todayQuery.refetch()} />
        )}

        {data && isNewUser && <GetStarted />}

        {data && !isNewUser && (
          <>
            {data.habits.length > 0 ? (
              <ProgressSummary summary={data.summary} isToday={isToday} />
            ) : (
              <Card>
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing scheduled for this day"
                  description="Enjoy the breather. Your other habits are listed below."
                />
              </Card>
            )}
            <HabitGroup
              id="group-todo"
              title="To do"
              items={toDo}
              date={date}
              readOnly={isFuture}
              focusRequestRef={focusRequestRef}
            />
            <HabitGroup
              id="group-done"
              title="Done"
              items={done}
              date={date}
              readOnly={isFuture}
              focusRequestRef={focusRequestRef}
            />
            {notScheduled.length > 0 && (
              <details className="group rounded-xl border border-border bg-surface-raised">
                <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-semibold text-fg-muted marker:hidden hover:bg-surface-muted">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                  Not scheduled {isToday ? 'today' : 'this day'} ({notScheduled.length})
                </summary>
                <ul className="divide-y divide-border border-t border-border px-4">
                  {notScheduled.map((habit) => (
                    <li key={habit.id} className="flex items-center gap-3 py-3 opacity-80">
                      <HabitIcon icon={habit.icon} color={habit.color} className="h-8 w-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{habit.name}</span>
                        <span className="block text-sm text-fg-muted">
                          {habit.startDate > date
                            ? `Starts ${longDate(habit.startDate)}`
                            : scheduleSummary(habit)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <WeeklyStrip today={today} selected={date} onSelect={setDate} />
          </>
        )}
      </div>
    </>
  );
}
