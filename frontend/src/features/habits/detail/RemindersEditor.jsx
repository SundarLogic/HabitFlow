/**
 * The user's reminders for one habit, editable in place (docs/API.md §9):
 *   change a time (saved when the field loses focus), switch a reminder on/off, delete it, or add
 *   a new time (up to 5). Errors from the API (e.g. two reminders at the same time) are shown as
 *   toasts and the list is reloaded.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellPlus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, IconButton, Input, useToast } from '../../../components/ui/index.js';
import { queryKeys } from '../../../lib/queryClient.js';
import { createReminder, deleteReminder, listReminders, updateReminder } from '../api.js';
import { MAX_REMINDERS } from '../constants.js';

/** @param {{ habit: object, readOnly: boolean }} props readOnly for archived habits */
export function RemindersEditor({ habit, readOnly }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const newTimeId = useId();
  const [newTime, setNewTime] = useState('08:00');
  const key = queryKeys.reminders(habit.id);
  const { data: reminders = [], isPending } = useQuery({
    queryKey: key,
    queryFn: () => listReminders(habit.id),
  });

  const save = useMutation({
    mutationFn: ({ action, reminder, changes }) => {
      if (action === 'create') return createReminder(habit.id, changes);
      if (action === 'delete') return deleteReminder(reminder.id);
      return updateReminder(reminder.id, changes);
    },
    onSuccess: (_, { action }) => {
      if (action === 'create') toast.success('Reminder added');
      if (action === 'delete') toast.success('Reminder removed');
    },
    onError: (error) => toast.error("Couldn't save the reminder", { description: error.message }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['today'] }); // the "Due now" badge
    },
  });

  if (isPending) return <p className="text-sm text-fg-muted">Loading reminders…</p>;

  return (
    <div className="space-y-3">
      {reminders.length === 0 && (
        <p className="text-sm text-fg-muted">
          No reminders yet. Add a time and we'll nudge you in the app.
        </p>
      )}
      <ul className="space-y-2">
        {reminders.map((reminder, index) => (
          <li key={reminder.id} className="flex flex-wrap items-center gap-3">
            <Input
              type="time"
              aria-label={`Reminder ${index + 1} time`}
              defaultValue={reminder.remindAt}
              disabled={readOnly}
              className="w-32"
              onBlur={(event) => {
                const value = event.target.value;
                if (value && value !== reminder.remindAt) {
                  save.mutate({ action: 'update', reminder, changes: { remindAt: value } });
                }
              }}
            />
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={reminder.enabled}
                disabled={readOnly}
                onChange={(event) =>
                  save.mutate({
                    action: 'update',
                    reminder,
                    changes: { enabled: event.target.checked },
                  })
                }
                className="h-4 w-4 accent-brand-600"
              />
              On
            </label>
            {!readOnly && (
              <IconButton
                label={`Delete reminder at ${reminder.remindAt}`}
                icon={Trash2}
                size="sm"
                onClick={() => save.mutate({ action: 'delete', reminder })}
              />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && reminders.length < MAX_REMINDERS && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ action: 'create', changes: { remindAt: newTime } });
          }}
        >
          <div>
            <label htmlFor={newTimeId} className="mb-1 block text-sm font-medium text-fg">
              New reminder
            </label>
            <Input
              id={newTimeId}
              type="time"
              required
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-32"
            />
          </div>
          <Button type="submit" variant="secondary" loading={save.isPending}>
            <BellPlus aria-hidden="true" className="h-4 w-4" />
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
