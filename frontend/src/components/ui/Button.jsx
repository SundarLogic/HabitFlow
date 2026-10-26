/**
 * Button and IconButton: the only clickable controls in the app (besides links).
 *
 *   <Button onClick={save} loading={isSaving}>Save</Button>
 *   <Button variant="secondary" size="sm">Cancel</Button>
 *   <IconButton label="Close" icon={X} onClick={close} />
 *
 * Accessibility: real <button> elements (keyboard and screen readers for free), type="button" by
 * default (so a button inside a form doesn't submit it by accident), visible focus ring, and
 * aria-busy while loading. IconButton REQUIRES a text label (read aloud and shown as a tooltip).
 */
import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/60',
  secondary:
    'border border-border bg-surface-raised text-fg hover:bg-surface-muted disabled:opacity-60',
  ghost: 'text-fg hover:bg-surface-muted disabled:opacity-60',
  danger: 'bg-danger text-on-danger hover:opacity-90 disabled:opacity-60',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed';

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.loading] shows a spinner, disables the button and sets aria-busy
 * @param {boolean} [props.fullWidth]
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    type = 'button',
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Spinner size="sm" label={null} />}
      {children}
    </button>
  );
});

/**
 * A square button showing only an icon.
 * @param {object} props
 * @param {string} props.label accessible name (required: an icon alone says nothing to a screen reader)
 * @param {import('react').ComponentType} props.icon a lucide-react icon component
 */
export const IconButton = forwardRef(function IconButton(
  { label, icon: Icon, variant = 'ghost', size = 'md', type = 'button', className, ...rest },
  ref,
) {
  const box = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' }[size];
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], box, 'p-0', className)}
      {...rest}
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </button>
  );
});
