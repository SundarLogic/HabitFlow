/**
 * Habit write actions as TanStack Query mutations, each refreshing every screen that shows habit
 * data (Today, Habits, habit detail, analytics) when it settles.
 *
 *   const { archive, unarchive, remove, createFromTemplate } = useHabitActions();
 *   archive.mutate(habit);
 *
 * Success and failure are reported with toasts; failures use the API's own message.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/index.js';
import { HABIT_DATA_FAMILIES } from '../../lib/queryClient.js';
import * as habitsApi from './api.js';

/** Friendly copy for the plan limit (the only 403 a habit action can hit). */
export function planLimitMessage(error) {
  const limit = error?.details?.limit;
  return `Your free plan includes ${limit ?? 'a limited number of'} active habits. Archive one to make room. Bigger plans are coming soon.`;
}

/** Re-fetches all habit-related data. */
export function useRefreshHabitData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(HABIT_DATA_FAMILIES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useHabitActions() {
  const toast = useToast();
  const refresh = useRefreshHabitData();

  const reportError = (title) => (error) => {
    toast.error(title, {
      description: error.code === 'PLAN_LIMIT_REACHED' ? planLimitMessage(error) : error.message,
    });
  };

  const archive = useMutation({
    mutationFn: (habit) => habitsApi.archiveHabit(habit.id),
    onSuccess: (_, habit) =>
      toast.success(`Archived "${habit.name}"`, { description: 'Its history is kept.' }),
    onError: reportError("Couldn't archive the habit"),
    onSettled: refresh,
  });

  const unarchive = useMutation({
    mutationFn: (habit) => habitsApi.unarchiveHabit(habit.id),
    onSuccess: (_, habit) => toast.success(`Restored "${habit.name}"`),
    onError: reportError("Couldn't restore the habit"),
    onSettled: refresh,
  });

  // Permanent delete: the API only deletes archived habits, so archive first when needed.
  const remove = useMutation({
    mutationFn: async (habit) => {
      if (habit.status !== 'archived') await habitsApi.archiveHabit(habit.id);
      await habitsApi.deleteHabitPermanently(habit.id);
    },
    onSuccess: (_, habit) => toast.success(`Deleted "${habit.name}"`),
    onError: reportError("Couldn't delete the habit"),
    onSettled: refresh,
  });

  const createFromTemplate = useMutation({
    mutationFn: (template) => habitsApi.createHabit(template.habit),
    onSuccess: (habit) => toast.success(`Added "${habit.name}"`),
    onError: reportError("Couldn't add the habit"),
    onSettled: refresh,
  });

  return { archive, unarchive, remove, createFromTemplate };
}
