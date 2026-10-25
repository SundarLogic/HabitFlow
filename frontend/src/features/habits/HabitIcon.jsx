/**
 * A habit's icon in its colour, as a small rounded tile. Decorative (the habit name next to it
 * carries the meaning), so it is hidden from screen readers.
 */
import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { HABIT_ICONS } from './constants.js';

export function HabitIcon({ icon, color, className }) {
  const Icon = HABIT_ICONS[icon]?.icon ?? Sparkles;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
        className,
      )}
      style={{ backgroundColor: color ?? '#64748B' }}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}
