/**
 * Today (/): the habits due today and the day's progress.
 *
 * Phase 8 is the foundation: it loads GET /today and shows loading, error and empty states, plus a
 * simple read-only list. Checking habits off arrives with the habits feature.
 */
import { useQuery } from '@tanstack/react-query';
import { Sprout } from 'lucide-react';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../components/ui/index.js';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { fetchToday } from '../features/today/api.js';
import { queryKeys } from '../lib/queryClient.js';

const STATUS = {
  completed: { tone: 'completed', label: 'Done' },
  pending: { tone: 'pending', label: 'To do' },
  missed: { tone: 'missed', label: 'Missed' },
  not_scheduled: { tone: 'unscheduled', label: 'Not today' },
  upcoming: { tone: 'unscheduled', label: 'Upcoming' },
};

function TodaySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only" role="status">
        Loading today's habits
      </span>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function TodayPage() {
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.today(),
    queryFn: () => fetchToday(),
  });

  const heading = data
    ? DateTime.fromISO(data.date).toLocaleString({ weekday: 'long', month: 'long', day: 'numeric' })
    : null;
  const firstName = user?.name?.split(' ')[0];

  return (
    <>
      <PageHeader
        title="Today"
        description={heading ? `${heading}${firstName ? ` · Hi, ${firstName}` : ''}` : undefined}
      />
      {isPending && <TodaySkeleton />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && data.habits.length === 0 && (
        <Card>
          <EmptyState
            icon={Sprout}
            title="Nothing scheduled today"
            description="Create your first habit and it will show up here on the days it's due."
            action={
              <Link
                to="/habits"
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Create a habit
              </Link>
            }
          />
        </Card>
      )}
      {data && data.habits.length > 0 && (
        <Card as="section" aria-labelledby="today-list-title">
          <h2 id="today-list-title" className="mb-1 text-base font-semibold">
            {data.summary.completed} of {data.summary.scheduled} done
          </h2>
          <ul className="divide-y divide-border">
            {data.habits.map(({ habit, status, streak }) => {
              const badge = STATUS[status] ?? STATUS.pending;
              return (
                <li key={habit.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium">{habit.name}</span>
                  <span className="flex items-center gap-3 text-sm text-fg-muted">
                    {streak.current > 0 && (
                      <span>
                        {streak.current} {streak.unit === 'weeks' ? 'wk' : 'day'} streak
                      </span>
                    )}
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
