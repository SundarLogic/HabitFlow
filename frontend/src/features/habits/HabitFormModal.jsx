/**
 * Create / edit a habit (a modal on desktop, full screen on phones).
 *
 *   <HabitFormModal open onClose={close} />               create
 *   <HabitFormModal open onClose={close} habit={habit} /> edit (also loads its reminders)
 *
 * Sections: details (name, description, category with suggestions, colour, icon), schedule
 * (Daily | Specific days | Times per week, start date) and reminders (up to 5 times).
 * Validation mirrors the API (formSchema.js); server errors appear next to their fields, and the
 * plan limit gets a friendly explanation instead of an error code.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { BellPlus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import {
  Button,
  FormField,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Skeleton,
  Textarea,
  useToast,
} from '../../components/ui/index.js';
import { todayIn } from '../../lib/dates.js';
import { applyServerErrors } from '../../lib/forms.js';
import { queryKeys } from '../../lib/queryClient.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FormError } from '../auth/FormError.jsx';
import * as habitsApi from './api.js';
import { MAX_REMINDERS } from './constants.js';
import { HABIT_FIELD_LABELS, habitFormSchema, toApiPayload, toFormValues } from './formSchema.js';
import { ColorPicker, IconPicker, TimesPerWeek, WeekdayChips } from './HabitFormFields.jsx';
import { planLimitMessage, useRefreshHabitData } from './useHabitActions.js';

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Specific days' },
  { value: 'weekly_target', label: 'Times per week' },
];

export function HabitFormModal({ open, onClose, habit = null }) {
  const isEdit = Boolean(habit);
  const remindersQuery = useQuery({
    queryKey: queryKeys.reminders(habit?.id),
    queryFn: () => habitsApi.listReminders(habit.id),
    enabled: open && isEdit,
  });
  const loading = isEdit && remindersQuery.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit "${habit.name}"` : 'New habit'}
      size="lg"
      fullScreenOnMobile
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="habit-form" disabled={loading}>
            {isEdit ? 'Save changes' : 'Create habit'}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        // Re-mount when switching habits so default values are fresh.
        <HabitForm
          key={habit?.id ?? 'new'}
          habit={habit}
          reminders={remindersQuery.data ?? []}
          onSaved={onClose}
        />
      )}
    </Modal>
  );
}

function HabitForm({ habit, reminders, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshHabitData();
  const today = todayIn(user?.timezone);
  const schema = useMemo(() => habitFormSchema({ today }), [today]);
  const categoriesId = useId();
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: habitsApi.listCategories,
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(habit, { today, reminders }),
  });
  const reminderFields = useFieldArray({ control, name: 'reminders' });
  const [frequencyType, color] = useWatch({ control, name: ['frequencyType', 'color'] });

  // Focus the name field. The modal's focus trap also honours data-autofocus, but only when the
  // modal opens; when editing, this form mounts later (after the reminders load).
  useEffect(() => {
    setFocus('name');
  }, [setFocus]);

  async function onSubmit(values) {
    const payload = toApiPayload(values);
    let saved;
    try {
      saved = habit
        ? await habitsApi.updateHabit(habit.id, payload)
        : await habitsApi.createHabit(payload);
    } catch (error) {
      if (error.code === 'PLAN_LIMIT_REACHED') {
        setError('root.server', { message: planLimitMessage(error) });
      } else {
        applyServerErrors(error, setError, { fields: HABIT_FIELD_LABELS });
      }
      return;
    }

    try {
      await habitsApi.syncReminders(saved.id, reminders, values.reminders);
    } catch (error) {
      toast.error('Habit saved, but its reminders were not', { description: error.message });
    }
    await refresh();
    toast.success(habit ? 'Changes saved' : `Added "${saved.name}"`);
    onSaved(saved);
  }

  return (
    <form id="habit-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormError message={errors.root?.server?.message} />

      <section aria-labelledby="habit-details" className="space-y-4">
        <h3
          id="habit-details"
          className="text-sm font-semibold tracking-wide text-fg-muted uppercase"
        >
          Details
        </h3>
        <FormField label="Name" error={errors.name?.message} required>
          {(field) => (
            <Input
              placeholder="e.g. Read 10 pages"
              autoComplete="off"
              data-autofocus
              {...field}
              {...register('name')}
            />
          )}
        </FormField>
        <FormField label="Description" error={errors.description?.message} hint="Optional">
          {(field) => <Textarea rows={2} {...field} {...register('description')} />}
        </FormField>
        <FormField
          label="Category"
          error={errors.category?.message}
          hint="Pick one you've used or type a new one."
        >
          {(field) => (
            <>
              <Input list={categoriesId} autoComplete="off" {...field} {...register('category')} />
              <datalist id={categoriesId}>
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="color"
            render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
          />
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <IconPicker value={field.value} onChange={field.onChange} color={color} />
            )}
          />
        </div>
      </section>

      <section aria-labelledby="habit-schedule" className="space-y-4">
        <h3
          id="habit-schedule"
          className="text-sm font-semibold tracking-wide text-fg-muted uppercase"
        >
          Schedule
        </h3>
        <Controller
          control={control}
          name="frequencyType"
          render={({ field }) => (
            <SegmentedControl
              legend="How often?"
              name="frequencyType"
              options={FREQUENCIES}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {frequencyType === 'weekdays' && (
          <Controller
            control={control}
            name="weekdays"
            render={({ field }) => (
              <WeekdayChips
                value={field.value}
                onChange={field.onChange}
                error={errors.weekdays?.message}
              />
            )}
          />
        )}
        {frequencyType === 'weekly_target' && (
          <Controller
            control={control}
            name="targetPerWeek"
            render={({ field }) => (
              <TimesPerWeek
                value={field.value}
                onChange={field.onChange}
                error={errors.targetPerWeek?.message}
              />
            )}
          />
        )}
        <FormField label="Start date" error={errors.startDate?.message} className="sm:w-56">
          {(field) => <Input type="date" {...field} {...register('startDate')} />}
        </FormField>
      </section>

      <section aria-labelledby="habit-reminders" className="space-y-3">
        <h3
          id="habit-reminders"
          className="text-sm font-semibold tracking-wide text-fg-muted uppercase"
        >
          Reminders
        </h3>
        <p className="text-sm text-fg-muted">
          We'll nudge you in the app at these times ({user?.timezone ?? 'your timezone'}) on days
          the habit is due.
        </p>
        <ul className="space-y-2">
          {reminderFields.fields.map((field, index) => (
            <li key={field.id} className="flex items-start gap-2">
              <FormField
                label={`Reminder ${index + 1}`}
                error={errors.reminders?.[index]?.remindAt?.message}
                className="flex-1 sm:max-w-48"
              >
                {(fieldProps) => (
                  <Input type="time" {...fieldProps} {...register(`reminders.${index}.remindAt`)} />
                )}
              </FormField>
              <IconButton
                label={`Remove reminder ${index + 1}`}
                icon={Trash2}
                className="mt-7"
                onClick={() => reminderFields.remove(index)}
              />
            </li>
          ))}
        </ul>
        {reminderFields.fields.length < MAX_REMINDERS && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reminderFields.append({ remindAt: '08:00' })}
          >
            <BellPlus aria-hidden="true" className="h-4 w-4" />
            Add reminder
          </Button>
        )}
      </section>

      {isSubmitting && (
        <p role="status" className="sr-only">
          Saving…
        </p>
      )}
    </form>
  );
}
