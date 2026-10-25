/**
 * useFocusTrap: keeps keyboard focus inside a container while it is open (modal dialogs).
 *
 * WCAG expectations for a modal dialog, all handled here:
 *   - on open, focus moves into the dialog (the element marked data-autofocus, else the first
 *     focusable element, else the dialog itself);
 *   - Tab / Shift+Tab cycle inside the dialog and never reach the page behind it;
 *   - Escape calls onEscape (the caller closes the dialog);
 *   - on close, focus returns to whatever was focused before (usually the button that opened it).
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable elements inside `root`, in DOM (tab) order. */
export function focusableIn(root) {
  return root ? [...root.querySelectorAll(FOCUSABLE)] : [];
}

/**
 * @param {boolean} active whether the trap is on
 * @param {{ onEscape?: () => void }} [options]
 * @returns {import('react').RefObject<HTMLElement>} attach to the container element
 */
export function useFocusTrap(active, { onEscape } = {}) {
  const containerRef = useRef(null);
  // Kept in a ref so a new onEscape function each render doesn't re-run the effect.
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement;

    const initial =
      container?.querySelector('[data-autofocus]') ?? focusableIn(container)[0] ?? container;
    initial?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableIn(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container?.addEventListener('keydown', onKeyDown);
    return () => {
      container?.removeEventListener('keydown', onKeyDown);
      // Give focus back to the opener, if it is still on the page.
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}
