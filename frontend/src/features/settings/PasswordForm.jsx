/**
 * Change password (PATCH /users/me/password). The API logs out every OTHER device and keeps this
 * session, and the form says so up front. A wrong current password (422 INVALID_CURRENT_PASSWORD)
 * is shown under that field.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Button, FormField, Input, useToast } from '../../components/ui/index.js';
import { applyServerErrors } from '../../lib/forms.js';
import { FormError } from '../auth/FormError.jsx';
import { PasswordStrength } from '../auth/PasswordStrength.jsx';
import { changePassword } from './api.js';
import { passwordSchema } from './schemas.js';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function PasswordForm() {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY });
  const newPassword = useWatch({ control, name: 'newPassword' });

  async function onSubmit(values) {
    try {
      await changePassword(values);
      reset(EMPTY);
      toast.success('Password changed', {
        description: 'Your other devices have been logged out.',
      });
    } catch (error) {
      applyServerErrors(error, setError, {
        fields: { currentPassword: 'Current password', newPassword: 'New password' },
        codeToField: { INVALID_CURRENT_PASSWORD: 'currentPassword' },
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-sm text-fg-muted">
        Changing your password logs you out on every other device. You stay logged in here.
      </p>
      <FormError message={errors.root?.server?.message} />
      <FormField label="Current password" error={errors.currentPassword?.message} required>
        {(field) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...field}
            {...register('currentPassword')}
          />
        )}
      </FormField>
      <FormField
        label="New password"
        error={errors.newPassword?.message}
        required
        hint={<PasswordStrength password={newPassword} />}
      >
        {(field) => (
          <Input
            type="password"
            autoComplete="new-password"
            {...field}
            {...register('newPassword')}
          />
        )}
      </FormField>
      <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
        {(field) => (
          <Input
            type="password"
            autoComplete="new-password"
            {...field}
            {...register('confirmPassword')}
          />
        )}
      </FormField>
      <Button type="submit" variant="secondary" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
