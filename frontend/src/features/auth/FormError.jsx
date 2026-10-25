/**
 * A form-level error banner (e.g. "Invalid email or password"), announced by screen readers as
 * soon as it appears (role="alert"). Renders nothing without a message.
 */
import { AlertCircle } from 'lucide-react';

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
