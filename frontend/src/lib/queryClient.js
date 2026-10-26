/**
 * TanStack Query setup: the cache that holds server data (the current user, habits, ...).
 *
 * Retry policy: retry network blips and 5xx once, but never 4xx: a 404 or 422 won't fix itself.
 */
import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys used in more than one place. Each starts with a "family" name so a whole family can
 * be refreshed at once, e.g. invalidateQueries({ queryKey: ['habits'] }) after any habit change.
 */
export const queryKeys = {
  me: ['auth', 'me'],
  today: (date) => ['today', date ?? 'current'],
  unreadCount: ['notifications', 'unread-count'],
  habits: (filters = {}) => ['habits', 'list', filters],
  categories: ['habits', 'categories'],
  habit: (id) => ['habit', id],
  reminders: (habitId) => ['habit', habitId, 'reminders'],
  analyticsSummary: (from, to, habitId) => ['analytics', 'summary', from, to, habitId ?? 'all'],
  heatmap: (from, to) => ['analytics', 'heatmap', from, to],
  habitHistory: (id, from, to) => ['habit', id, 'history', from, to],
  completions: (filters) => ['habit', 'completions', filters],
  notifications: ['notifications', 'list'],
};

/** Families refreshed after anything that changes habits or completions. */
export const HABIT_DATA_FAMILIES = [['today'], ['habits'], ['habit'], ['analytics']];

/**
 * @returns {QueryClient} a fresh client (tests create one per test)
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error?.status >= 400 && error?.status < 500) return false;
          return failureCount < 1;
        },
      },
      // Saves fail fast when offline ("always" = don't pause until the connection returns):
      // the optimistic change rolls back at once and the toast offers Retry, instead of a
      // change that looks saved but would be lost on reload (Phase 11, ADR-052).
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
