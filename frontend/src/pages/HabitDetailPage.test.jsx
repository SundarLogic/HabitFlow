/**
 * Habit detail: header and stats, the month calendar (optimistic toggle of a past day, rollback
 * on error, read-only when archived), notes on today's completion, reminders and the 404 state.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { DateTime } from 'luxon';
import { HttpResponse, delay, http } from 'msw';
import { db, fakeToday, key, makeHabit } from '../test/fakeHabits.js';
import { renderApp, statValue } from '../test/renderApp.jsx';
import { backend, server } from '../test/server.js';

beforeAll(() => import('./HabitDetailPage.jsx'));

beforeEach(() => {
  backend.loggedIn = true;
});

const today = () => DateTime.fromISO(fakeToday());
const dayLabel = (date) =>
  date.toLocaleString({ weekday: 'short', month: 'short', day: 'numeric' });
/** A day in the CURRENT month before today (the 1st if today is the 1st). */
const earlierThisMonth = () => (today().day > 1 ? today().minus({ days: 1 }) : today());

function addHabit(overrides) {
  const habit = makeHabit({ name: 'Water', category: 'Health', ...overrides });
  db.habits.push(habit);
  return habit;
}

it('shows the habit, its schedule and its stats', async () => {
  const habit = addHabit();
  db.streaks.set(habit.id, { current: 3, longest: 12 });
  db.completions.add(key(habit.id, today().minus({ days: 1 }).toISODate()));
  renderApp(`/habits/${habit.id}`);

  expect(await screen.findByRole('heading', { level: 1, name: 'Water' })).toBeInTheDocument();
  expect(screen.getByText('Every day')).toBeInTheDocument();
  expect(await statValue('Current streak')).toBe('3 days');
  expect(await statValue('Longest streak')).toBe('12 days');
  await waitFor(async () => expect(await statValue('Completions')).toBe('1'));
  await waitFor(async () => expect(await statValue('Completion rate')).toMatch(/%$/));
});

it('clicking a past day in the calendar marks it done at once, and saves it', async () => {
  const habit = addHabit({ startDate: today().minus({ days: 40 }).toISODate() });
  const day = earlierThisMonth();
  server.use(
    http.put('/api/v1/habits/:id/completions/:date', async ({ params }) => {
      await delay(300);
      db.completions.add(key(params.id, params.date));
      return HttpResponse.json({ completion: {} }, { status: 201 });
    }),
  );
  const { user } = renderApp(`/habits/${habit.id}`);
  const status = day.hasSame(today(), 'day') ? 'not done yet' : 'missed';
  const button = await screen.findByRole('button', { name: `${dayLabel(day)}: ${status}` });
  expect(button).toHaveAttribute('aria-pressed', 'false');

  await user.click(button);
  // Optimistic: pressed before the (slow) server answers.
  const done = screen.getByRole('button', { name: `${dayLabel(day)}: done` });
  expect(done).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(db.completions.has(key(habit.id, day.toISODate()))).toBe(true));
});

it('flips the day back with a message when saving fails', async () => {
  const habit = addHabit();
  const day = earlierThisMonth();
  server.use(
    http.put('/api/v1/habits/:id/completions/:date', () =>
      HttpResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Server down' } },
        { status: 500 },
      ),
    ),
  );
  const { user } = renderApp(`/habits/${habit.id}`);
  const status = day.hasSame(today(), 'day') ? 'not done yet' : 'missed';
  await user.click(await screen.findByRole('button', { name: `${dayLabel(day)}: ${status}` }));
  expect(await screen.findByText(`Couldn't update ${dayLabel(day)}`)).toBeInTheDocument();
  expect(
    await screen.findByRole('button', { name: `${dayLabel(day)}: ${status}` }),
  ).toHaveAttribute('aria-pressed', 'false');
});

it('future days and archived habits are read-only', async () => {
  const habit = addHabit({ status: 'archived' });
  renderApp(`/habits/${habit.id}`);
  const calendar = await screen.findByRole('region', { name: 'Calendar' });
  await within(calendar).findByRole('table');
  expect(within(calendar).queryAllByRole('button', { pressed: false })).toHaveLength(0);
  expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
});

it('saves a note for today once today is done', async () => {
  const habit = addHabit();
  db.completions.add(key(habit.id, fakeToday()));
  const { user } = renderApp(`/habits/${habit.id}`);
  const notes = await screen.findByRole('region', { name: 'Notes' });
  const field = await within(notes).findByRole('textbox', { name: 'Note for today' });
  await user.type(field, 'Two litres');
  await user.click(within(notes).getByRole('button', { name: 'Save note' }));
  expect(await screen.findByText('Note saved')).toBeInTheDocument();
  expect(db.notes.get(key(habit.id, fakeToday()))).toBe('Two litres');
  expect(await within(notes).findByText('Two litres', { selector: 'p' })).toBeInTheDocument();
});

it('adds, switches off and deletes a reminder', async () => {
  const habit = addHabit();
  const { user } = renderApp(`/habits/${habit.id}`);
  const reminders = await screen.findByRole('region', { name: 'Reminders' });
  expect(await within(reminders).findByText(/No reminders yet/)).toBeInTheDocument();

  const time = within(reminders).getByLabelText('New reminder');
  await user.clear(time);
  await user.type(time, '07:30');
  await user.click(within(reminders).getByRole('button', { name: 'Add' }));
  expect(await within(reminders).findByLabelText('Reminder 1 time')).toHaveValue('07:30');

  await user.click(within(reminders).getByRole('checkbox', { name: 'On' }));
  await waitFor(() => expect(db.reminders[0].enabled).toBe(false));

  await user.click(within(reminders).getByRole('button', { name: 'Delete reminder at 07:30' }));
  expect(await within(reminders).findByText(/No reminders yet/)).toBeInTheDocument();
  expect(db.reminders).toHaveLength(0);
});

it('shows "Habit not found" for an unknown or foreign habit', async () => {
  renderApp('/habits/00000000-0000-4000-8000-0000000000ff');
  expect(await screen.findByRole('heading', { name: 'Habit not found' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to habits' })).toHaveAttribute('href', '/habits');
});
