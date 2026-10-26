/**
 * Completion history for the selected range (GET /completions, newest first, 20 per page):
 * date, habit and note. Previous / Next paging; the page resets when the filters change.
 */
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui/index.js';
import { queryKeys } from '../../lib/queryClient.js';
import { listCompletions } from '../habits/api.js';

const PAGE_SIZE = 20;

/**
 * @param {{ from: string, to: string, habitId?: string, habitNames: Map<string, string> }} props
 *   habitNames: id -> name (completions only carry the habit id)
 */
export function HistoryList({ from, to, habitId, habitNames }) {
  const filterKey = `${from}|${to}|${habitId ?? ''}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  // New filters -> back to page 1 (derived during render instead of an effect).
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next) => setPaging({ key: filterKey, page: next });

  const filters = { from, to, habitId, page, limit: PAGE_SIZE };
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.completions(filters),
    queryFn: () => listCompletions(filters),
    placeholderData: (previous) => previous, // keep the old page visible while the next loads
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;

  return (
    <Card as="section" aria-labelledby="history-title">
      <h2 id="history-title" className="text-base font-semibold text-fg">
        History
      </h2>
      {isPending && <Skeleton className="mt-4 h-40 w-full" />}
      {isError && <p className="mt-4 text-sm text-fg-muted">Couldn't load your history.</p>}
      {data && data.data.length === 0 && (
        <EmptyState title="No completions in this period" className="py-8" />
      )}
      {data && data.data.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-border">
            {data.data.map((completion) => (
              <li
                key={completion.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2.5 text-sm"
              >
                <time dateTime={completion.completionDate} className="w-28 shrink-0 text-fg-muted">
                  {DateTime.fromISO(completion.completionDate).toLocaleString(DateTime.DATE_MED)}
                </time>
                <Link
                  to={`/habits/${completion.habitId}`}
                  className="font-medium text-fg hover:underline"
                >
                  {habitNames.get(completion.habitId) ?? 'Habit'}
                </Link>
                {completion.note && (
                  <span className="w-full text-fg-muted sm:w-auto">“{completion.note}”</span>
                )}
              </li>
            ))}
          </ul>
          <nav
            aria-label="History pages"
            className="mt-3 flex items-center justify-between text-sm"
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </Button>
            <span className="text-fg-muted">
              Page {page} of {totalPages} · {data.meta.total} completions
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Older
            </Button>
          </nav>
        </>
      )}
    </Card>
  );
}
