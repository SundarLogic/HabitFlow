/**
 * The custom inputs of the habit form. Each is built on NATIVE inputs so keyboard and screen
 * reader support comes from the browser:
 *   WeekdayChips   checkboxes styled as Mon..Sun toggle chips (fieldset + legend)
 *   ColorPicker    radio group of colour swatches, each named ("Emerald")
 *   IconPicker     radio group of icons, each named ("Book")
 *   TimesPerWeek   number input with − / + buttons (1..7)
 * All are controlled: pass value + onChange (react-hook-form's Controller does this).
 */
import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { IconButton } from '../../components/ui/index.js';
import { cn } from '../../lib/cn.js';
import { HABIT_COLORS, HABIT_ICONS, WEEKDAYS } from './constants.js';

/** Shared look of a selectable chip whose hidden input is the `peer` just before it. */
const CHIP =
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

export function WeekdayChips({ value, onChange, error }) {
  const id = useId();
  const toggle = (day) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-fg">Days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => (
          <div key={day.value}>
            <input
              id={`${id}-${day.value}`}
              type="checkbox"
              className="peer sr-only"
              checked={value.includes(day.value)}
              onChange={() => toggle(day.value)}
            />
            <label
              htmlFor={`${id}-${day.value}`}
              title={day.long}
              className={cn(
                'flex h-10 w-11 cursor-pointer items-center justify-center rounded-lg border border-border text-sm font-medium text-fg-muted',
                'peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white',
                CHIP,
              )}
            >
              <span aria-hidden="true">{day.short}</span>
              <span className="sr-only">{day.long}</span>
            </label>
          </div>
        ))}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}

export function TimesPerWeek({ value, onChange, error }) {
  const id = useId();
  const number = Number(value) || 1;
  const set = (next) => onChange(Math.min(7, Math.max(1, next)));
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        Times per week
      </label>
      <div className="flex items-center gap-2">
        <IconButton
          label="One time fewer"
          icon={Minus}
          variant="secondary"
          onClick={() => set(number - 1)}
          disabled={number <= 1}
        />
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={7}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="h-10 w-16 rounded-lg border border-border bg-surface-raised text-center text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring"
        />
        <IconButton
          label="One time more"
          icon={Plus}
          variant="secondary"
          onClick={() => set(number + 1)}
          disabled={number >= 7}
        />
        <span id={`${id}-hint`} className="text-sm text-fg-muted">
          on any days you like
        </span>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {HABIT_COLORS.map((color) => (
          <div key={color.value}>
            <input
              id={`${name}-${color.value}`}
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === color.value}
              onChange={() => onChange(color.value)}
            />
            <label
              htmlFor={`${name}-${color.value}`}
              title={color.name}
              className={cn(
                'block h-8 w-8 cursor-pointer rounded-full ring-offset-2 ring-offset-surface-raised',
                'peer-checked:ring-2 peer-checked:ring-fg',
                CHIP,
              )}
              style={{ backgroundColor: color.value }}
            >
              <span className="sr-only">{color.name}</span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function IconPicker({ value, onChange, color }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">Icon</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(HABIT_ICONS).map(([key, { icon: Icon, name: label }]) => (
          <div key={key}>
            <input
              id={`${name}-${key}`}
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === key}
              onChange={() => onChange(key)}
            />
            <label
              htmlFor={`${name}-${key}`}
              title={label}
              className={cn(
                'flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border text-fg-muted',
                'peer-checked:border-transparent peer-checked:text-white',
                CHIP,
              )}
              style={value === key ? { backgroundColor: color } : undefined}
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
              <span className="sr-only">{label}</span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
