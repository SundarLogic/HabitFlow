/**
 * The logged-in app frame (responsive):
 *   desktop (md+)  sidebar navigation on the left, top bar, content
 *   mobile         top bar, content, bottom navigation bar
 *
 * Accessibility: a "Skip to main content" link is the first focusable element; the sidebar and
 * bottom bar are <nav> landmarks with distinct names; the current page link has
 * aria-current="page" (NavLink does this); <main id="main-content"> is the skip target.
 */
import { Moon, Sun } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { HabitFormProvider } from '../../features/habits/HabitFormProvider.jsx';
import { NotificationBell } from '../../features/notifications/NotificationBell.jsx';
import { cn } from '../../lib/cn.js';
import { useTheme } from '../../lib/theme.jsx';
import { IconButton } from '../ui/index.js';
import { Logo } from './Logo.jsx';
import { NAV_ITEMS } from './navigation.js';
import { UserMenu } from './UserMenu.jsx';

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to main content
    </a>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <IconButton
      label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={dark ? Sun : Moon}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    />
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-raised md:flex md:flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )
                }
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav
      aria-label="Main (mobile)"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-muted',
                )
              }
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <SkipLink />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur md:justify-end md:px-8">
          <Logo className="md:hidden" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        {/* tabIndex -1 lets the skip link move focus here; pb-20 keeps content above the bottom bar. */}
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
          <div className="mx-auto max-w-5xl">
            {/* The habit form can be opened from any page (useHabitForm). */}
            <HabitFormProvider>
              <Outlet />
            </HabitFormProvider>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
