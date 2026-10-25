/**
 * Live password guidance under the signup password field: a strength meter plus the three rules
 * (8+ characters, a letter, a number) ticked off as they are met. The text is the real signal;
 * the bar is decoration. Changes are announced politely to screen readers.
 */
import { Check, Circle } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { passwordStrength } from './schemas.js';

const BAR_COLORS = [
  'bg-border',
  'bg-status-missed',
  'bg-amber-500',
  'bg-brand-500',
  'bg-status-completed',
];

export function PasswordStrength({ password }) {
  const { score, label, checks } = passwordStrength(password);
  return (
    <div className="space-y-1.5">
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1 flex-1 rounded-full',
              step <= score ? BAR_COLORS[score] : 'bg-border',
            )}
          />
        ))}
      </div>
      <p aria-live="polite">
        {password ? `Strength: ${label}` : 'Use 8 or more characters with a letter and a number.'}
      </p>
      <ul className="space-y-0.5">
        {checks.map((check) => (
          <li
            key={check.label}
            className={cn('flex items-center gap-1.5', check.met && 'text-status-completed')}
          >
            {check.met ? (
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Circle aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            <span>
              {check.label}
              <span className="sr-only">{check.met ? ' (done)' : ' (not yet)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
