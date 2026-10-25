/**
 * usePageTitle('Habits') -> the browser tab reads "Habits · HabitFlow".
 * In a single-page app the title is what screen readers announce after navigation, so every page
 * sets one.
 */
import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · HabitFlow` : 'HabitFlow';
  }, [title]);
}
