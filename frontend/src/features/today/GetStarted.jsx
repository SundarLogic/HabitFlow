/**
 * First-run empty state: a friendly welcome, "Create your first habit" (opens the form) and
 * one-click starter templates that create a habit immediately.
 */
import { Plus, Sprout } from 'lucide-react';
import { Button, Card, EmptyState } from '../../components/ui/index.js';
import { HABIT_TEMPLATES } from '../habits/constants.js';
import { HabitIcon } from '../habits/HabitIcon.jsx';
import { useHabitForm } from '../habits/HabitFormProvider.jsx';
import { useHabitActions } from '../habits/useHabitActions.js';

export function GetStarted() {
  const { openCreate } = useHabitForm();
  const { createFromTemplate } = useHabitActions();

  return (
    <Card>
      <EmptyState
        icon={Sprout}
        title="Let's build your first habit"
        description="Start small: one habit you can do in a few minutes a day is plenty."
        action={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create your first habit
          </Button>
        }
      />
      <section aria-labelledby="templates-title" className="border-t border-border pt-5">
        <h2 id="templates-title" className="text-center text-sm font-medium text-fg-muted">
          Or start with one of these
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {HABIT_TEMPLATES.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                onClick={() => createFromTemplate.mutate(template)}
                disabled={createFromTemplate.isPending}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-surface-muted disabled:opacity-60"
              >
                <HabitIcon icon={template.habit.icon} color={template.habit.color} />
                <span>
                  <span className="block font-medium text-fg">Add “{template.label}”</span>
                  <span className="block text-sm text-fg-muted">{template.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
