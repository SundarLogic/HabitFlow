/**
 * Light / dark / system theme.
 *
 * The choice is saved in localStorage ('hf-theme') and applied as a `dark` class on <html>,
 * which the Tailwind `dark:` variant and the semantic colour tokens (styles/index.css) follow.
 * index.html applies the saved theme before the first paint; this provider keeps it in sync
 * afterwards, including when the OS switches while 'system' is selected.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'hf-theme';
const ThemeContext = createContext(null);

function readSaved() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** Provides { theme, resolvedTheme, setTheme } to the app. */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readSaved);
  const [systemDark, setSystemDark] = useState(prefersDark);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice lasts for this page only.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** @returns {{ theme: 'light'|'dark'|'system', resolvedTheme: 'light'|'dark', setTheme: Function }} */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
