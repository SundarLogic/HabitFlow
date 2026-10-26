/**
 * Notification bell in the top bar, with its inbox panel.
 *
 *   badge     GET /notifications/unread-count, polled every minute and on window focus. The count
 *             is part of the button's name ("Notifications, 2 unread"), not only the visual badge.
 *   panel     a non-modal dialog (the page stays usable) listing the latest notifications, each
 *             linking to its habit; "Mark read" per item and "Mark all read". Escape or a click
 *             outside closes it and focus returns to the bell.
 *   announce  when the count goes UP, a polite live region reads the new notification titles
 *             ("New: It's time for Gym"), so screen reader users hear reminders as they arrive.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, useToast } from '../../components/ui/index.js';
import { cn } from '../../lib/cn.js';
import { queryKeys } from '../../lib/queryClient.js';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from './api.js';

const POLL_MS = 60_000;

/** "5 minutes ago" (falls back to the date for old items). */
function when(iso) {
  const time = DateTime.fromISO(iso);
  return DateTime.now().diff(time, 'days').days < 7
    ? time.toRelative()
    : time.toLocaleString(DateTime.DATE_MED);
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const panelId = useId();
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const lastCountRef = useRef(null);

  const { data: unread = 0 } = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: fetchUnreadCount,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const listQuery = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => fetchNotifications({ limit: 20 }),
    enabled: open,
  });

  // Announce arrivals: compare with the previous count (null = first load, never announced).
  useEffect(() => {
    const previous = lastCountRef.current;
    lastCountRef.current = unread;
    if (previous === null || unread <= previous) return;
    const added = unread - previous;
    queryClient
      .fetchQuery({
        queryKey: queryKeys.notifications,
        queryFn: () => fetchNotifications({ limit: 20 }),
      })
      .then((result) => {
        const titles = result.data
          .filter((n) => !n.readAt)
          .slice(0, added)
          .map((n) => n.message);
        setAnnouncement(`New: ${titles.join('. ') || `${added} notifications`}`);
      })
      .catch(() => setAnnouncement(`${added} new notification${added === 1 ? '' : 's'}`));
  }, [unread, queryClient]);

  // Focus the panel's heading when it opens; close on a click outside.
  useEffect(() => {
    if (!open) return undefined;
    headingRef.current?.focus();
    function onPointerDown(event) {
      if (!panelRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  /** After any read change: the badge and the list are refetched. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markOne = useMutation({
    mutationFn: (notification) => markNotificationRead(notification.id),
    onSettled: refresh,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => queryClient.setQueryData(queryKeys.unreadCount, 0),
    onError: (error) =>
      toast.error("Couldn't mark notifications as read", { description: error.message }),
    onSettled: refresh,
  });

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  const items = listQuery.data?.data ?? [];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg hover:bg-surface-muted"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            data-testid="unread-badge"
            className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={`${panelId}-title`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          className={cn(
            'z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg',
            'fixed inset-x-2 top-14 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2
              ref={headingRef}
              tabIndex={-1}
              id={`${panelId}-title`}
              className="text-sm font-semibold text-fg outline-none"
            >
              Notifications
            </h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={unread === 0}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
          <div className="overflow-y-auto">
            {listQuery.isPending && (
              <div className="flex justify-center p-6">
                <Spinner label="Loading notifications" />
              </div>
            )}
            {listQuery.isError && (
              <p className="p-4 text-sm text-fg-muted">
                Couldn't load notifications. Try again later.
              </p>
            )}
            {listQuery.data && items.length === 0 && (
              <p className="p-6 text-center text-sm text-fg-muted">
                You're all caught up. Reminders and streak milestones show up here.
              </p>
            )}
            {items.length > 0 && (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const unreadItem = !n.readAt;
                  const habitId = n.data?.habitId;
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        'flex gap-3 px-4 py-3',
                        unreadItem && 'bg-brand-50/60 dark:bg-brand-900/30',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          unreadItem ? 'bg-brand-600' : 'bg-transparent',
                        )}
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-fg">
                          {unreadItem && <span className="sr-only">Unread: </span>}
                          {habitId ? (
                            <Link
                              to={`/habits/${habitId}`}
                              className="hover:underline"
                              onClick={() => {
                                if (unreadItem) markOne.mutate(n);
                                setOpen(false);
                              }}
                            >
                              {n.title}
                            </Link>
                          ) : (
                            n.title
                          )}
                        </p>
                        <p className="text-fg-muted">{n.message}</p>
                        <p className="mt-1 flex items-center gap-3 text-xs text-fg-muted">
                          <time dateTime={n.createdAt}>{when(n.createdAt)}</time>
                          {unreadItem && (
                            <button
                              type="button"
                              onClick={() => markOne.mutate(n)}
                              className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                            >
                              Mark read<span className="sr-only">: {n.title}</span>
                            </button>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
