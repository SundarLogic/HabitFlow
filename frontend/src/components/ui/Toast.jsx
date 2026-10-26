/**
 * Toast notifications: short, non-blocking messages ("Habit saved").
 *
 *   const toast = useToast();
 *   toast.success('Habit saved');
 *   toast.error(error.message);
 *   toast.show({ title: 'Heads up', description: '...', tone: 'info', duration: 8000 });
 *   toast.error("Couldn't save", { action: { label: 'Retry', onClick: save } });
 *
 * Accessibility: toasts live in a polite live region (errors in an assertive one), so screen
 * readers announce them without stealing focus. Each has a close button, and the auto-dismiss
 * timer pauses while the pointer or keyboard focus is on the toast (WCAG 2.2.1).
 */
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Button, IconButton } from './Button.jsx';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info };
const ICON_COLORS = {
  success: 'text-status-completed',
  error: 'text-danger',
  info: 'text-brand-600 dark:text-brand-300',
};
let nextId = 0;

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.tone] ?? Info;

  useEffect(() => {
    if (paused || toast.duration === Infinity) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  return (
    <li
      className="pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2 shadow-lg sm:items-start sm:p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[toast.tone])} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-fg-muted">{toast.description}</p>}
      </div>
      {toast.action && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onDismiss(toast.id);
            toast.action.onClick();
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <IconButton
        label="Dismiss notification"
        icon={X}
        size="sm"
        onClick={() => onDismiss(toast.id)}
      />
    </li>
  );
}

/** Wrap the app once; renders the toast stack in the bottom corner. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(({ title, description, tone = 'info', duration = 5000, action }) => {
    nextId += 1;
    // A toast with an action stays longer, so there is time to reach the button.
    const toast = {
      id: nextId,
      title,
      description,
      tone,
      action,
      duration: action ? 12_000 : duration,
    };
    setToasts((current) => [...current.slice(-2), toast]); // at most 3 on screen
    return toast.id;
  }, []);

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (title, options) => show({ ...options, title, tone: 'success' }),
      error: (title, options) => show({ ...options, title, tone: 'error', duration: 8000 }),
      info: (title, options) => show({ ...options, title, tone: 'info' }),
    }),
    [show, dismiss],
  );

  const polite = toasts.filter((t) => t.tone !== 'error');
  const assertive = toasts.filter((t) => t.tone === 'error');
  const stack = 'pointer-events-none flex w-full flex-col gap-2';

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Phones: top of the screen, so toasts never cover the thumb zone (bottom nav, primary
          buttons, full-screen dialog footers). Larger screens: bottom-right corner. */}
      <div className="fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:w-96 sm:items-end">
        <ul aria-live="assertive" aria-label="Errors" className={stack}>
          {assertive.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </ul>
        <ul aria-live="polite" aria-label="Notifications" className={stack}>
          {polite.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}

/** @returns {{ show: Function, dismiss: Function, success: Function, error: Function, info: Function }} */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
