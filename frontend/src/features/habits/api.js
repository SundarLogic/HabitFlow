/**
 * Habit and reminder API calls (docs/API.md §6 and §9), via the shared apiClient.
 */
import { api } from '../../services/apiClient.js';

/**
 * GET /habits. limit=100 is the API maximum; the free plan allows 10 active habits.
 * @param {{ status?: 'active'|'archived'|'all', search?: string, category?: string }} [filters]
 * @returns {Promise<object[]>} habits ordered by sortOrder
 */
export async function listHabits({ status = 'active', search, category } = {}) {
  const params = { status, limit: 100 };
  if (search) params.search = search;
  if (category) params.category = category;
  const { data } = await api.get('/habits', { params });
  return data.data;
}

/** GET /habits/categories -> ['Fitness', 'Health', ...] */
export async function listCategories() {
  const { data } = await api.get('/habits/categories');
  return data.data;
}

/** POST /habits -> the created habit. */
export async function createHabit(input) {
  const { data } = await api.post('/habits', input);
  return data.habit;
}

/** PATCH /habits/:id -> the updated habit. */
export async function updateHabit(id, changes) {
  const { data } = await api.patch(`/habits/${id}`, changes);
  return data.habit;
}

export async function archiveHabit(id) {
  const { data } = await api.post(`/habits/${id}/archive`);
  return data.habit;
}

export async function unarchiveHabit(id) {
  const { data } = await api.post(`/habits/${id}/unarchive`);
  return data.habit;
}

/** DELETE /habits/:id?permanent=true (the API requires the habit to be archived first). */
export async function deleteHabitPermanently(id) {
  await api.delete(`/habits/${id}`, { params: { permanent: true } });
}

/** PATCH /habits/reorder with the full new order. */
export async function reorderHabits(orderedIds) {
  await api.patch('/habits/reorder', {
    items: orderedIds.map((id, index) => ({ id, sortOrder: index })),
  });
}

/** PUT /habits/:id/completions/:date (idempotent). */
export async function markComplete(habitId, date) {
  const { data } = await api.put(`/habits/${habitId}/completions/${date}`);
  return data.completion;
}

/** DELETE /habits/:id/completions/:date (idempotent). */
export async function unmarkComplete(habitId, date) {
  await api.delete(`/habits/${habitId}/completions/${date}`);
}

// --- Reminders (the requesting user's, per habit) --------------------------------------------

export async function listReminders(habitId) {
  const { data } = await api.get(`/habits/${habitId}/reminders`);
  return data.data;
}

export async function createReminder(habitId, { remindAt }) {
  const { data } = await api.post(`/habits/${habitId}/reminders`, { remindAt });
  return data.reminder;
}

export async function updateReminder(reminderId, changes) {
  const { data } = await api.patch(`/reminders/${reminderId}`, changes);
  return data.reminder;
}

export async function deleteReminder(reminderId) {
  await api.delete(`/reminders/${reminderId}`);
}

/**
 * Brings a habit's reminders in line with the form: deletes removed times, updates changed ones,
 * creates new ones. Deletes run first so a time can move from one row to another without a
 * duplicate conflict.
 * @param {string} habitId
 * @param {{ id?: string, remindAt: string }[]} existing as loaded
 * @param {{ id?: string, remindAt: string }[]} wanted as edited in the form
 */
export async function syncReminders(habitId, existing, wanted) {
  const wantedIds = new Set(wanted.filter((r) => r.id).map((r) => r.id));
  for (const reminder of existing) {
    if (!wantedIds.has(reminder.id)) await deleteReminder(reminder.id);
  }
  for (const reminder of wanted) {
    const before = existing.find((r) => r.id === reminder.id);
    if (!reminder.id) await createReminder(habitId, reminder);
    else if (before && before.remindAt !== reminder.remindAt) {
      await updateReminder(reminder.id, { remindAt: reminder.remindAt });
    }
  }
}

// --- Habit detail ----------------------------------------------------------------------------

/** GET /habits/:id -> { habit, streaks: { current, longest, unit, status, weekProgress? } } */
export async function getHabit(id) {
  const { data } = await api.get(`/habits/${id}`);
  return data;
}

/** GET /habits/:id/history -> { habitId, range, data: [{ date, status, completed }] } */
export async function getHabitHistory(id, { from, to }) {
  const { data } = await api.get(`/habits/${id}/history`, { params: { from, to } });
  return data;
}

/**
 * GET /completions (the user's own, newest first). from/to are required, at most 366 days.
 * @returns {Promise<{ data: object[], meta: { page: number, limit: number, total: number } }>}
 */
export async function listCompletions({ from, to, habitId, page = 1, limit = 20 }) {
  const params = { from, to, page, limit };
  if (habitId) params.habitId = habitId;
  const { data } = await api.get('/completions', { params });
  return data;
}

/** PUT with a note: marks the day done if needed and stores the note (idempotent). */
export async function saveCompletionNote(habitId, date, note) {
  const { data } = await api.put(`/habits/${habitId}/completions/${date}`, { note });
  return data.completion;
}
