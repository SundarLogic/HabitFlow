/**
 * In-app notification API calls (docs/API.md §10). Notifications belong to the user, not to a
 * workspace.
 */
import { api } from '../../services/apiClient.js';

export async function fetchUnreadCount() {
  const { data } = await api.get('/notifications/unread-count');
  return data.unreadCount;
}

/** Newest first. @returns {Promise<{ data: object[], meta: object }>} */
export async function fetchNotifications({ limit = 20 } = {}) {
  const { data } = await api.get('/notifications', { params: { limit } });
  return data;
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data.notification;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post('/notifications/read-all');
  return data.updated;
}
