/**
 * Analytics API calls (docs/API.md §8). The numbers' rules are in docs/STREAK_RULES.md §8: rates
 * are fractions 0..1 and `null` when nothing was due.
 */
import { api } from '../../services/apiClient.js';

/** GET /analytics/summary?from&to&habitId -> every dashboard block for the range. */
export async function fetchSummary({ from, to, habitId }) {
  const params = { from, to };
  if (habitId) params.habitId = habitId;
  const { data } = await api.get('/analytics/summary', { params });
  return data;
}

/** GET /analytics/heatmap?from&to -> { range, data: [{ date, completed, scheduled }] } */
export async function fetchHeatmap({ from, to }) {
  const { data } = await api.get('/analytics/heatmap', { params: { from, to } });
  return data;
}
