/**
 * SegmentedControl: pick one of a few options, shown as joined buttons.
 *
 *   <SegmentedControl legend="Frequency" name="frequencyType" value={v} onChange={setV}
 *     options={[{ value: 'daily', label: 'Daily' }, ...]} />
 *
 * Built from NATIVE radio buttons inside a fieldset, so it is a real radio group: Tab enters it,
 * arrow keys change the choice, and screen readers say "Frequency, Daily, radio, 1 of 3".
 * The radios are visually hidden; their labels are the visible segments.
 */
import { useId } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * @param {object} props
 * @param {string} props.legend group label (visible unless hideLegend)
 * @param {string} props.name radio group name
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.hideLegend]
 */
export function SegmentedControl({
  legend,
  name,
  options,
  value,
  onChange,
  hideLegend,
  className,
}) {
  const id = useId();
  return (
    <fieldset className={className}>
      <legend className={cn('mb-1.5 text-sm font-medium text-fg', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      <div className="grid auto-cols-fr grid-flow-col rounded-lg border border-border bg-surface-muted p-1">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <div key={option.value}>
              <input
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={optionId}
                className={cn(
                  'flex h-9 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm font-medium',
                  'text-fg-muted peer-checked:bg-surface-raised peer-checked:text-fg peer-checked:shadow-sm',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-ring',
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
