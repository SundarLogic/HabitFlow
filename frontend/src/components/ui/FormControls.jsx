/**
 * Form controls: Label, FormField, Input, Textarea, Select, Checkbox.
 *
 * FormField wires accessibility for you: a <label> bound to the control, the hint and error text
 * linked through aria-describedby, aria-invalid when there is an error, and the error announced
 * (role="alert") when it appears. Usage with react-hook-form:
 *
 *   <FormField label="Email" error={errors.email?.message}>
 *     {(field) => <Input type="email" autoComplete="email" {...field} {...register('email')} />}
 *   </FormField>
 *
 * The render function receives { id, 'aria-invalid', 'aria-describedby' }.
 * Controls forward refs, which react-hook-form's register() needs.
 */
import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn.js';

const CONTROL =
  'block w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-fg ' +
  'placeholder:text-fg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-0 ' +
  'focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger';

/** A visible label. `required` adds a marker (the control itself carries aria-required). */
export function Label({ htmlFor, required, className, children }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-fg', className)}>
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      )}
    </label>
  );
}

/**
 * Label + control + hint + error, correctly linked.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error] error text (also switches the control to the invalid state)
 * @param {import('react').ReactNode} [props.hint] help text under the control
 * @param {boolean} [props.required]
 * @param {(field: object) => import('react').ReactNode} props.children render function
 */
export function FormField({ label, error, hint, required, className, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {hint && (
        <div id={hintId} className="text-xs text-fg-muted">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(CONTROL, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'py-2', className)} {...rest} />;
});

/**
 * Native <select>: fully keyboard and screen-reader accessible on every platform.
 * @param {{ options?: { value: string, label: string }[] }} props or pass <option> children
 */
export const Select = forwardRef(function Select({ className, options, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(CONTROL, 'h-10 pr-8', className)} {...rest}>
      {options
        ? options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        : children}
    </select>
  );
});

/** A checkbox with its label to the right; the whole row is clickable. */
export const Checkbox = forwardRef(function Checkbox(
  { label, description, className, id: idProp, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 h-4 w-4 rounded border-border accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        {...rest}
      />
      <div className="text-sm">
        <label htmlFor={id} className="font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-fg-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
});
