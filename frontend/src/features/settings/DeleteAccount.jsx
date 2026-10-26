/**
 * Danger zone: delete the account (DELETE /users/me).
 *
 * Two deliberate steps inside a dialog: re-type the password AND type DELETE. On success the
 * server has removed the account and its cookies; endSession() drops every cached query and
 * sends the user to /signup. A wrong password stays in the dialog under the password field;
 * 409 RESOURCE_IN_USE (still owns a team workspace) is shown at the top of the dialog.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, FormField, Input, Modal, useToast } from '../../components/ui/index.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FormError } from '../auth/FormError.jsx';
import { deleteAccount } from './api.js';
import { DELETE_WORD, deleteAccountSchema } from './schemas.js';

const EMPTY = { password: '', confirm: '' };

export function DeleteAccount() {
  const { endSession } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(deleteAccountSchema), defaultValues: EMPTY });

  function close() {
    setOpen(false);
    reset(EMPTY);
  }

  async function onSubmit({ password }) {
    try {
      await deleteAccount({ password });
      endSession('/signup');
      toast.success('Your account has been deleted', {
        description: 'Thanks for trying HabitFlow.',
      });
    } catch (error) {
      applyServerErrors(error, setError, {
        fields: { password: 'Password' },
        codeToField: { INVALID_CURRENT_PASSWORD: 'password' },
      });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Deleting your account removes all your habits, history and reminders. This can&apos;t be
        undone.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Modal
        open={open}
        onClose={close}
        role="alertdialog"
        title="Delete your account?"
        description="All your habits, completions and reminders will be permanently deleted."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="delete-account-form"
              variant="danger"
              loading={isSubmitting}
            >
              Delete my account
            </Button>
          </>
        }
      >
        <form
          id="delete-account-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormError message={errors.root?.server?.message} />
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
          <FormField
            label={`Type ${DELETE_WORD} to confirm`}
            error={errors.confirm?.message}
            required
          >
            {(field) => (
              <Input autoComplete="off" spellCheck={false} {...field} {...register('confirm')} />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
