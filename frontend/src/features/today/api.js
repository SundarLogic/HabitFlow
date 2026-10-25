/**
 * GET /today (docs/API.md §7): the dashboard data for one day.
 */
import { api } from '../../services/apiClient.js';

/**
 * @param {string} [date] 'YYYY-MM-DD'; omitted = today in the user's timezone
 * @returns {Promise<{ date: string, today: string, habits: object[], summary: object }>}
 */
export async function fetchToday(date) {
  const { data } = await api.get('/today', { params: date ? { date } : undefined });
  return data;
}
