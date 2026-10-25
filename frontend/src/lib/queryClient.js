/**
 * TanStack Query setup: the cache that holds server data (the current user, habits, ...).
 *
 * Retry policy: retry network blips and 5xx once, but never 4xx: a 404 or 422 won't fix itself.
 */
import { QueryClient } from '@tanstack/react-query';

/** Query keys used in more than one place. */
export const queryKeys = {
  me: ['auth', 'me'],
  today: (date) => ['today', date ?? 'current'],
  unreadCount: ['notifications', 'unread-count'],
};

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
      mutations: { retry: false },
    },
  });
}
