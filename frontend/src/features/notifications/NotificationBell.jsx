/**
 * Notification bell in the top bar (placeholder until the inbox panel lands in a later phase).
 *
 * It already shows the unread count (GET /notifications/unread-count, refreshed every minute), and
 * the count is part of the button's accessible name ("Notifications, 2 unread"), so screen
 * reader users get the same information as the visual badge.
 */
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useToast } from '../../components/ui/index.js';
import { queryKeys } from '../../lib/queryClient.js';
import { api } from '../../services/apiClient.js';

async function fetchUnreadCount() {
  const { data } = await api.get('/notifications/unread-count');
  return data.unreadCount;
}

export function NotificationBell() {
  const toast = useToast();
  const { data: unread = 0 } = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => toast.info('The notification inbox is coming soon.')}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg hover:bg-surface-muted"
    >
      <Bell aria-hidden="true" className="h-5 w-5" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-semibold text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
