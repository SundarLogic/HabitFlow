/**
 * Login form: validates on submit (zod), then calls useAuth().login.
 *
 * Server errors: a wrong email/password (401 INVALID_CREDENTIALS) is shown at the top of the
 * form without saying which field was wrong (the API never reveals whether an email exists);
 * field errors from the server (422) go under their fields. On success, PublicOnlyRoute sends
 * the user on to ?returnTo or Today.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, FormField, Input } from '../../components/ui/index.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useAuth } from './AuthProvider.jsx';
import { FormError } from './FormError.jsx';
import { loginSchema } from './schemas.js';

export function LoginForm() {
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  async function onSubmit(values) {
    try {
      await login(values);
    } catch (error) {
      applyServerErrors(error, setError, { fields: { email: 'Email', password: 'Password' } });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormError message={errors.root?.server?.message} />
      <FormField label="Email" error={errors.email?.message} required>
        {(field) => <Input type="email" autoComplete="email" {...field} {...register('email')} />}
      </FormField>
      <FormField label="Password" error={errors.password?.message} required>
        {(field) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...field}
            {...register('password')}
          />
        )}
      </FormField>
      <Button type="submit" fullWidth loading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
}
