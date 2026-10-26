/**
 * Settings forms that change the user record (PATCH /users/me):
 *   ProfileForm         the name (the email is shown read-only: it is the login and can't change)
 *   TimezoneForm        the IANA timezone, searchable; it decides what "today" means, so after a
 *                       change EVERY cached query is refetched (Today, streaks and analytics all
 *                       depend on the user's date)
 *   NotificationPrefs   in-app notifications and reminders on/off, saved on each click
 * Each form updates the cached user (useAuth().setUser) with the server's answer.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Checkbox, FormField, Input, useToast } from '../../components/ui/index.js';
import { applyServerErrors } from '../../lib/forms.js';
import { timezoneOptions } from '../../lib/timezones.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FormError } from '../auth/FormError.jsx';
import { updateMe } from './api.js';
import { profileSchema, timezoneSchema } from './schemas.js';

export function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name } });

  async function onSubmit(values) {
    try {
      const updated = await updateMe(values);
      setUser(updated);
      reset({ name: updated.name });
      toast.success('Profile saved');
    } catch (error) {
      applyServerErrors(error, setError, { fields: { name: 'Name' } });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError message={errors.root?.server?.message} />
      <FormField label="Name" error={errors.name?.message} required>
        {(field) => <Input autoComplete="name" {...field} {...register('name')} />}
      </FormField>
      <FormField label="Email" hint="Your email is your login and can't be changed here.">
        {(field) => (
          <Input type="email" value={user.email} readOnly {...field} className="bg-surface-muted" />
        )}
      </FormField>
      <Button type="submit" variant="secondary" loading={isSubmitting} disabled={!isDirty}>
        Save profile
      </Button>
    </form>
  );
}

export function TimezoneForm() {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const listId = useId();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(timezoneSchema),
    defaultValues: { timezone: user.timezone },
  });

  async function onSubmit(values) {
    try {
      const updated = await updateMe(values);
      setUser(updated);
      reset({ timezone: updated.timezone });
      // "Today" may now be a different date: refetch everything that depends on it.
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      toast.success(`Timezone set to ${updated.timezone}`);
    } catch (error) {
      applyServerErrors(error, setError, { fields: { timezone: 'Timezone' } });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError message={errors.root?.server?.message} />
      <FormField
        label="Timezone"
        error={errors.timezone?.message}
        required
        hint="Start typing a city or region, e.g. Lisbon or America/New_York."
      >
        {(field) => (
          <Input
            list={listId}
            autoComplete="off"
            spellCheck={false}
            {...field}
            {...register('timezone')}
          />
        )}
      </FormField>
      <datalist id={listId}>
        {timezoneOptions(user.timezone).map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <p className="flex items-start gap-2 rounded-lg bg-status-pending-soft p-3 text-sm text-fg">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
        Your timezone decides when your day starts and ends. Changing it changes which date counts
        as &quot;today&quot;, and when reminders arrive.
      </p>
      <Button type="submit" variant="secondary" loading={isSubmitting} disabled={!isDirty}>
        Save timezone
      </Button>
    </form>
  );
}

export function NotificationPrefs() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const prefs = user.notificationPreferences ?? { inApp: true, reminders: true };
  const save = useMutation({
    mutationFn: (changes) => updateMe({ notificationPreferences: changes }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Preferences saved');
    },
    onError: (error) =>
      toast.error("Couldn't save your preferences", { description: error.message }),
  });

  return (
    <fieldset className="space-y-3" disabled={save.isPending}>
      <legend className="sr-only">Notification preferences</legend>
      <Checkbox
        label="In-app notifications"
        description="Show reminders and streak milestones under the bell."
        checked={prefs.inApp}
        onChange={(event) => save.mutate({ inApp: event.target.checked })}
      />
      <Checkbox
        label="Habit reminders"
        description="Send a reminder at the times you set on each habit."
        checked={prefs.reminders}
        onChange={(event) => save.mutate({ reminders: event.target.checked })}
      />
    </fieldset>
  );
}
