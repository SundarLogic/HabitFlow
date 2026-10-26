/**
 * Day picker for the Today page: Previous / Next day, "Today", and a date input.
 * "Next" stops at today (the future is read-only and reached only by typing a date). The keyboard
 * shortcuts ← / → (useTodayShortcuts) do the same as the buttons, advertised via
 * aria-keyshortcuts.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/index.js';
import { addDays } from '../../lib/dates.js';

/**
 * @param {{ date: string, today: string, onChange: (date: string) => void }} props
 */
export function DateNavigator({ date, today, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconButton
        label="Previous day"
        icon={ChevronLeft}
        variant="secondary"
        aria-keyshortcuts="ArrowLeft"
        onClick={() => onChange(addDays(date, -1))}
      />
      <input
        type="date"
        aria-label="Choose a date"
        value={date}
        max={today}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-surface-raised px-3 text-sm text-fg focus-within:outline-2 focus-within:outline-ring"
      />
      <IconButton
        label="Next day"
        icon={ChevronRight}
        variant="secondary"
        aria-keyshortcuts="ArrowRight"
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      />
      <Button variant="ghost" size="md" disabled={date === today} onClick={() => onChange(today)}>
        Today
      </Button>
    </div>
  );
}
