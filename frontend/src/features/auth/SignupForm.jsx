/**
 * Signup form: name, email, password (with a live strength hint) and timezone.
 *
 * The timezone is detected from the browser (Intl) and can be changed: it decides what "today"
 * means for the user's habits, so it matters that it is right. Server errors map to fields:
 * 409 EMAIL_TAKEN -> email, 422 field details -> their fields.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, FormField, Input, Select } from '../../components/ui/index.js';
import { applyServerErrors } from '../../lib/forms.js';
import { detectTimezone, timezoneOptions } from '../../lib/timezones.js';
import { useAuth } from './AuthProvider.jsx';
import { FormError } from './FormError.jsx';
import { PasswordStrength } from './PasswordStrength.jsx';
import { signupSchema } from './schemas.js';

const FIELD_LABELS = { name: 'Name', email: 'Email', password: 'Password', timezone: 'Timezone' };

export function SignupForm() {
  const { signup } = useAuth();
  const detected = useMemo(() => detectTimezone(), []);
  const zones = useMemo(() => timezoneOptions(detected), [detected]);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', timezone: detected },
  });
  // useWatch re-renders only this component when the password changes (for the strength hint).
  const password = useWatch({ control, name: 'password' });

  async function onSubmit(values) {
    try {
      await signup(values);
    } catch (error) {
      applyServerErrors(error, setError, {
        fields: FIELD_LABELS,
        codeToField: { EMAIL_TAKEN: 'email' },
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError message={errors.root?.server?.message} />
      <FormField label="Name" error={errors.name?.message} required>
        {(field) => <Input autoComplete="name" {...field} {...register('name')} />}
      </FormField>
      <FormField label="Email" error={errors.email?.message} required>
        {(field) => <Input type="email" autoComplete="email" {...field} {...register('email')} />}
      </FormField>
      <FormField
        label="Password"
        error={errors.password?.message}
        hint={<PasswordStrength password={password} />}
        required
      >
        {(field) => (
          <Input type="password" autoComplete="new-password" {...field} {...register('password')} />
        )}
      </FormField>
      <FormField
        label="Timezone"
        error={errors.timezone?.message}
        hint="Used to decide when your day starts and ends."
        required
      >
        {(field) => (
          <Select {...field} {...register('timezone')}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <Button type="submit" fullWidth loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
