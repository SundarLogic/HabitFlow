/**
 * Notes on completions: write a short note for today's completion (e.g. "ran 5 km") and see the
 * most recent notes. A note belongs to a completion (PUT /habits/:id/completions/:date { note }),
 * so it can be added once today is done.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useId, useState } from 'react';
import { Button, Textarea, useToast } from '../../../components/ui/index.js';
import { HABIT_DATA_FAMILIES } from '../../../lib/queryClient.js';
import { saveCompletionNote } from '../api.js';

const MAX_NOTE = 280;

/**
 * @param {{ habit: object, today: string, completions: object[], readOnly: boolean }} props
 *   completions: recent completions of this habit, newest first
 */
export function NotesCard({ habit, today, completions, readOnly }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fieldId = useId();
  const todays = completions.find((c) => c.completionDate === today);
  const [draft, setDraft] = useState(todays?.note ?? '');
  const notes = completions.filter((c) => c.note).slice(0, 5);

  const save = useMutation({
    mutationFn: () => saveCompletionNote(habit.id, today, draft.trim() || null),
    onSuccess: () => toast.success('Note saved'),
    onError: (error) => toast.error("Couldn't save the note", { description: error.message }),
    onSettled: () =>
      Promise.all(
        HABIT_DATA_FAMILIES.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return (
    <div className="space-y-4">
      {!readOnly && todays && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          className="space-y-2"
        >
          <label htmlFor={fieldId} className="block text-sm font-medium text-fg">
            Note for today
          </label>
          <Textarea
            id={fieldId}
            rows={2}
            maxLength={MAX_NOTE}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="How did it go?"
            aria-describedby={`${fieldId}-count`}
          />
          <div className="flex items-center justify-between">
            <span id={`${fieldId}-count`} className="text-xs text-fg-muted">
              {draft.length}/{MAX_NOTE}
            </span>
            <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
              Save note
            </Button>
          </div>
        </form>
      )}
      {!readOnly && !todays && (
        <p className="text-sm text-fg-muted">Mark today done to add a note about it.</p>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-fg-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((c) => (
            <li key={c.id} className="text-sm">
              <time dateTime={c.completionDate} className="block text-xs text-fg-muted">
                {DateTime.fromISO(c.completionDate).toLocaleString(DateTime.DATE_MED)}
              </time>
              <p className="text-fg">{c.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
