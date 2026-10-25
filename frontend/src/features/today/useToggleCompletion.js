/**
 * useToggleCompletion(habit, date): ticks ONE habit done (PUT) or undoes it (DELETE) for `date`,
 * with an OPTIMISTIC update so the toggle responds instantly. Each habit row owns one, so every
 * row tracks its own request.
 *
 * Flow (TanStack Query's optimistic-update recipe):
 *   1. onMutate: cancel in-flight /today fetches (they'd overwrite the guess), then write the
 *      guess (optimistic.js) into the cache.
 *   2. onError: undo by applying the INVERSE toggle to the current cache (not by restoring a
 *      snapshot: a snapshot would also wipe out another row ticked in the meantime), and toast.
 *   3. onSettled (success or not): refetch today, habits and analytics so streaks, rates and
 *      the weekly strip come from the server's truth.
 *
 * Rapid double clicks: the toggle is disabled while its request is in flight (`isPending`), so
 * a second click can't race the first. Ticking moves the row from "To do" to "Done", which
 * REMOUNTS it; the pending state therefore comes from the shared mutation cache (keyed per habit
 * and date, read with useIsMutating) rather than from this component's own observer, so the new
 * row knows the request is still running.
 */
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/index.js';
import { HABIT_DATA_FAMILIES, queryKeys } from '../../lib/queryClient.js';
import { markComplete, unmarkComplete } from '../habits/api.js';
import { applyToggle } from './optimistic.js';

/**
 * @param {{ id: string, name: string }} habit
 * @param {string} date 'YYYY-MM-DD' being viewed
 * @returns {{ toggle: (done: boolean) => void, isPending: boolean }}
 */
export function useToggleCompletion(habit, date) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.today(date);
  const mutationKey = ['toggle-completion', habit.id, date];
  const inFlight = useIsMutating({ mutationKey }) > 0;

  const mutation = useMutation({
    mutationKey,
    mutationFn: (done) => (done ? markComplete(habit.id, date) : unmarkComplete(habit.id, date)),
    onMutate: async (done) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (data) => applyToggle(data, { habitId: habit.id, done }));
    },
    onError: (error, done) => {
      queryClient.setQueryData(key, (data) =>
        applyToggle(data, { habitId: habit.id, done: !done }),
      );
      toast.error(done ? `Couldn't mark "${habit.name}" done` : `Couldn't undo "${habit.name}"`, {
        description: error.message,
      });
    },
    onSettled: () =>
      Promise.all(
        HABIT_DATA_FAMILIES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return { toggle: (done) => mutation.mutate(done), isPending: inFlight };
}
