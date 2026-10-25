/**
 * Reminder controller: the HTTP layer for /habits/:id/reminders and /reminders/:id.
 * Middleware has set req.user and req.workspace; inputs are validated.
 */
import { toPublicReminder } from '../serializers/reminder.js';
import * as reminderService from '../services/reminderService.js';

/** GET /habits/:id/reminders -> { data: [reminder] } (the requesting user's reminders) */
export async function list(req, res) {
  const reminders = await reminderService.listReminders({
    workspace: req.workspace,
    user: req.user,
    habitId: req.params.id,
  });
  res.json({ data: reminders.map(toPublicReminder) });
}

/** POST /habits/:id/reminders { remindAt, weekdays?, enabled? } -> 201 { reminder } */
export async function create(req, res) {
  const reminder = await reminderService.createReminder({
    workspace: req.workspace,
    user: req.user,
    habitId: req.params.id,
    input: req.body,
  });
  res.status(201).json({ reminder: toPublicReminder(reminder) });
}

/** PATCH /reminders/:id -> { reminder } */
export async function update(req, res) {
  const reminder = await reminderService.updateReminder({
    workspace: req.workspace,
    user: req.user,
    reminderId: req.params.id,
    changes: req.body,
  });
  res.json({ reminder: toPublicReminder(reminder) });
}

/** DELETE /reminders/:id -> 204 */
export async function remove(req, res) {
  await reminderService.deleteReminder({
    workspace: req.workspace,
    user: req.user,
    reminderId: req.params.id,
  });
  res.status(204).end();
}
