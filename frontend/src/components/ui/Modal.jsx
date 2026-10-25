/**
 * Modal dialog and ConfirmDialog.
 *
 *   <Modal open={open} onClose={close} title="Edit habit" footer={<Button>Save</Button>}>...</Modal>
 *   <ConfirmDialog open={open} onCancel={close} onConfirm={remove} title="Delete habit?"
 *     description="This can't be undone." confirmLabel="Delete" tone="danger" />
 *
 * Accessibility (WAI-ARIA dialog pattern): role="dialog" + aria-modal, labelled by its title and
 * described by its description; focus moves in, is trapped, and returns to the opener on close
 * (useFocusTrap); Escape and the close button close it; the page behind can't scroll. Rendered in
 * a portal on <body> so no parent's overflow or z-index can clip it.
 */
import { X } from 'lucide-react';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { cn } from '../../lib/cn.js';
import { Button, IconButton } from './Button.jsx';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose called on Escape, the close button or a backdrop click
 * @param {string} props.title
 * @param {import('react').ReactNode} [props.description]
 * @param {import('react').ReactNode} [props.footer] usually action buttons
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {'dialog'|'alertdialog'} [props.role='dialog'] alertdialog for confirmations
 * @param {boolean} [props.fullScreenOnMobile] fill the screen below the `sm` breakpoint (long
 *   forms); the body scrolls while the title and footer stay visible
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  role = 'dialog',
  fullScreenOnMobile = false,
  children,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useFocusTrap(open, { onEscape: onClose });

  // Stop the page behind the dialog from scrolling while it is open.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4',
        fullScreenOnMobile ? 'p-0' : 'p-4',
      )}
    >
      {/* Backdrop: a mouse convenience; keyboard users close with Escape or the button. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={containerRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col rounded-2xl border border-border bg-surface-raised shadow-xl',
          width,
          fullScreenOnMobile &&
            'max-sm:h-full max-sm:max-h-none max-sm:rounded-none max-sm:border-0',
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" icon={X} size="sm" onClick={onClose} />
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Are you sure?" dialog. The CANCEL button receives focus first, so pressing Enter by reflex
 * never confirms a destructive action.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
