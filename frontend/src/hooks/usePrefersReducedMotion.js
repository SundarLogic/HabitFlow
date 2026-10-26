/**
 * usePrefersReducedMotion(): true when the user asked the OS/browser to reduce motion.
 *
 * CSS animations are already switched off by a global rule (styles/index.css). This hook is for
 * motion made in JavaScript, which that rule can't reach, e.g. Recharts' growing bars.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange) {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

const getSnapshot = () => window.matchMedia?.(QUERY).matches ?? false;

/** @returns {boolean} */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
