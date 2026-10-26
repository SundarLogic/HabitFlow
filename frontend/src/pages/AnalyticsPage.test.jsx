/**
 * The Analytics page: the null-rate empty state (never "0%"), stat cards from the summary, filters
 * kept in the URL, the custom-range limit, the year heatmap (one cell per day, keyboard roving)
 * and the paginated history list.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { DateTime } from 'luxon';
import { db, fakeToday, key, makeHabit } from '../test/fakeHabits.js';
import { currentUrl, renderApp, statValue } from '../test/renderApp.jsx';
import { backend } from '../test/server.js';

// The page and its charts are lazy-loaded chunks; importing them once up front keeps the first
// test from timing out while Recharts is transformed.
beforeAll(() =>
  Promise.all([import('./AnalyticsPage.jsx'), import('../features/analytics/ChartsSection.jsx')]),
);

beforeEach(() => {
  backend.loggedIn = true;
});

const daysAgo = (n) => DateTime.fromISO(fakeToday()).minus({ days: n }).toISODate();

it('shows "No scheduled habits in this period" when the completion rate is null', async () => {
  renderApp('/analytics');
  expect(
    await screen.findByRole('heading', { name: 'No scheduled habits in this period' }),
  ).toBeInTheDocument();
  // The rate card says "—", not 0%: nothing was due, so nothing was missed.
  expect(await statValue('Completion rate')).toBe('—');
  expect(screen.queryByRole('figure', { name: /daily completion rate/i })).not.toBeInTheDocument();
});

it('shows the rate and charts (with data tables) once habits were due', async () => {
  const habit = makeHabit({ name: 'Water', category: 'Health', startDate: daysAgo(10) });
  db.habits.push(habit);
  for (const n of [1, 2, 3]) db.completions.add(key(habit.id, daysAgo(n)));
  renderApp('/analytics?range=7d');

  // 7-day range: 6 past days due (today is still open), 3 done -> 50%.
  await waitFor(async () => expect(await statValue('Completion rate')).toBe('50%'));
  expect(await statValue('Completed')).toBe('3 / 6');
  expect(screen.queryByText('No scheduled habits in this period')).not.toBeInTheDocument();
  for (const name of [/daily completion/i, /weekly completion/i, /by habit/i, /by category/i]) {
    expect(await screen.findByRole('figure', { name })).toBeInTheDocument();
  }
});

it('keeps the period and habit filters in the URL', async () => {
  db.habits.push(makeHabit({ name: 'Water' }));
  const { user, router } = renderApp('/analytics');
  await user.click(await screen.findByRole('radio', { name: '90 days' }));
  expect(currentUrl(router)).toBe('/analytics?range=90d');

  await user.selectOptions(screen.getByRole('combobox', { name: 'Habit' }), 'Water');
  expect(currentUrl(router)).toBe(`/analytics?range=90d&habit=${db.habits[0].id}`);
});

it('refuses a custom range over 366 days and falls back to 30 days', async () => {
  renderApp(`/analytics?range=custom&from=${daysAgo(400)}&to=${fakeToday()}`);
  expect(await screen.findByRole('alert')).toHaveTextContent(/366 days/);
  expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
});

it('the heatmap has one cell per day of the last 365 days, and arrow keys move between them', async () => {
  const { user } = renderApp('/analytics');
  const grid = await screen.findByRole('grid', { name: 'Last 12 months' });
  const cells = await within(grid).findAllByRole('gridcell');
  expect(cells).toHaveLength(365);

  // One tab stop: today by default. (Cells are in row order, Mon..Sun, so today isn't the last.)
  const label = (date) =>
    DateTime.fromISO(date).toLocaleString({
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const focusable = cells.filter((cell) => cell.tabIndex === 0);
  expect(focusable).toHaveLength(1);
  expect(focusable[0]).toHaveAccessibleName(new RegExp(`^${label(fakeToday())}`));

  focusable[0].focus();
  await user.keyboard('{ArrowUp}');
  expect(document.activeElement).toHaveAccessibleName(new RegExp(`^${label(daysAgo(1))}`));
});

it('lists completions in the history, newest first, with links to the habit', async () => {
  const habit = makeHabit({ name: 'Water' });
  db.habits.push(habit);
  db.completions.add(key(habit.id, daysAgo(1)));
  db.completions.add(key(habit.id, daysAgo(3)));
  db.notes.set(key(habit.id, daysAgo(1)), 'Two litres');
  renderApp('/analytics');

  const history = await screen.findByRole('region', { name: 'History' });
  await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(2));
  const [first] = within(history).getAllByRole('listitem');
  expect(first).toHaveTextContent('Two litres');
  expect(within(first).getByRole('link', { name: 'Water' })).toHaveAttribute(
    'href',
    `/habits/${habit.id}`,
  );
  expect(within(history).getByText(/Page 1 of 1 · 2 completions/)).toBeInTheDocument();
});
