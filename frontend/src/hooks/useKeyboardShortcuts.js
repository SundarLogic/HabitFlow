/**
 * Page-level single-key shortcuts, e.g. on Today: ← / → change the day, "n" opens New Habit.
 *
 *   useKeyboardShortcuts({ ArrowLeft: prevDay, ArrowRight: nextDay, n: openCreate });
 *
 * A shortcut is ignored when it would get in the way (WCAG 2.1.4):
 *   - while typing in a field (input, textarea, select, contenteditable);
 *   - with Ctrl / Alt / Meta held (browser and OS shortcuts keep working);
 *   - while a modal dialog is open (its own keys win).
 * Advertise shortcuts with aria-keyshortcuts on the matching buttons.
 */
import { useEffect, useRef } from 'react';

function isTypingTarget(element) {
  if (!(element instanceof HTMLElement)) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

/** @param {Record<string, () => void>} bindings key (event.key) -> handler */
export function useKeyboardShortcuts(bindings) {
  // Latest handlers in a ref, so the listener is attached once.
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  });

  useEffect(() => {
    function onKeyDown(event) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const handler =
        bindingsRef.current[event.key] ?? bindingsRef.current[event.key.toLowerCase()];
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
