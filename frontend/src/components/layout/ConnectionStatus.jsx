/**
 * Offline banner. While the browser reports no connection, a bar at the top of the app says so
 * (role="status", announced politely); when the connection returns, a "Back online" toast appears
 * and TanStack Query refetches stale data by itself (refetchOnReconnect).
 *
 * Saves made while offline fail at once with a Retry button (lib/mutationErrors.js); nothing is
 * queued, because HabitFlow has no offline sync (PRD: PWA improvements are for later).
 */
import { WifiOff } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useToast } from '../ui/index.js';

function subscribe(onChange) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const isOnline = () => navigator.onLine;

/** @returns {boolean} whether the browser thinks it is online (updates live) */
export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

export function ConnectionStatus() {
  const online = useOnline();
  const toast = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success('Back online');
    }
  }, [online, toast]);

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="flex items-center justify-center gap-2 bg-status-pending-soft px-4 py-2 text-center text-sm text-fg">
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          You&apos;re offline. Changes can&apos;t be saved until your connection is back.
        </p>
      )}
    </div>
  );
}
