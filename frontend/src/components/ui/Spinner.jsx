/**
 * Spinner: a loading indicator.
 *   <Spinner />                    announces "Loading" to screen readers
 *   <Spinner label={null} />       decorative only (e.g. inside a button that has aria-busy)
 */
import { cn } from '../../lib/cn.js';

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

/**
 * @param {{ size?: 'sm'|'md'|'lg', label?: string | null, className?: string }} props
 */
export function Spinner({ size = 'md', label = 'Loading', className }) {
  const circle = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        SIZES[size],
        className,
      )}
    />
  );
  if (label === null) return circle;
  return (
    <span role="status" className="inline-flex items-center">
      {circle}
      <span className="sr-only">{label}</span>
    </span>
  );
}
