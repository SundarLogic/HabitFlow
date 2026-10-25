/**
 * The HabitFlow wordmark. Decorative mark + text, so screen readers just read "HabitFlow".
 */
import { Check } from 'lucide-react';

export function Logo({ className }) {
  return (
    <span className={className}>
      <span className="inline-flex items-center gap-2 text-lg font-bold text-fg">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        HabitFlow
      </span>
    </span>
  );
}
