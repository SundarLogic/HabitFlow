/**
 * The app's main destinations, shared by the desktop sidebar and the mobile bottom bar so both
 * always list the same pages in the same order.
 */
import { BarChart3, CalendarCheck, ListChecks, Settings } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', label: 'Today', icon: CalendarCheck, end: true },
  { to: '/habits', label: 'Habits', icon: ListChecks },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];
