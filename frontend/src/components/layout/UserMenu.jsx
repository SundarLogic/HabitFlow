/**
 * The account menu in the top bar: who is logged in, Settings, and Log out.
 */
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider.jsx';
import { DropdownMenu } from '../ui/index.js';

/** "Ana Lima" -> "AL" for the avatar circle. */
function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu
      label="Account"
      items={[
        { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
        { label: 'Log out', icon: LogOut, onSelect: logout },
      ]}
      trigger={(props) => (
        <button
          {...props}
          aria-label={`Account menu for ${user?.name ?? 'you'}`}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100"
          >
            {initials(user?.name)}
          </span>
          <span className="hidden max-w-32 truncate text-sm font-medium text-fg sm:inline">
            {user?.name}
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        </button>
      )}
    />
  );
}
