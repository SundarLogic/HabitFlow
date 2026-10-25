/**
 * The Habits page: tabs, search and category filter, archive / restore, the delete dialog that
 * offers archiving first, and keyboard-accessible reordering.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { db, makeHabit } from '../test/fakeHabits.js';
import { renderApp } from '../test/renderApp.jsx';
import { backend } from '../test/server.js';

beforeEach(() => {
  backend.loggedIn = true;
  db.habits.push(
    makeHabit({ name: 'Water', category: 'Health' }),
    makeHabit({ name: 'Run', category: 'Fitness' }),
    makeHabit({ name: 'Read', category: 'Learning' }),
  );
});

const rowNames = () =>
  within(screen.getByRole('tabpanel'))
    .getAllByRole('link')
    .map((link) => link.textContent);

async function openActions(user, name) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

it('archiving removes the habit from the active list and shows it under Archived', async () => {
  const { user } = renderApp('/habits');
  await openActions(user, 'Run');
  await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

  await waitFor(() => expect(rowNames()).toEqual(['Water', 'Read']));
  expect(await screen.findByText('Archived "Run"')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Archived' }));
  await waitFor(() => expect(rowNames()).toEqual(['Run']));
  await openActions(user, 'Run');
  await user.click(screen.getByRole('menuitem', { name: 'Restore' }));
  await waitFor(() => expect(db.habits.find((h) => h.name === 'Run').status).toBe('active'));
});

it('the delete dialog offers archiving as the safer choice', async () => {
  const { user } = renderApp('/habits');
  await openActions(user, 'Water');
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

  const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Water"?' });
  expect(dialog).toHaveAccessibleDescription(/keeps your history/);
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

  await user.click(within(dialog).getByRole('button', { name: 'Archive instead' }));
  await waitFor(() => expect(db.habits.find((h) => h.name === 'Water').status).toBe('archived'));
  expect(db.habits).toHaveLength(3); // nothing deleted
});

it('"Delete permanently" removes the habit', async () => {
  const { user } = renderApp('/habits');
  await openActions(user, 'Water');
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await user.click(await screen.findByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(db.habits.map((h) => h.name)).toEqual(['Run', 'Read']));
});

it('searches by name and filters by category', async () => {
  const { user } = renderApp('/habits');
  await screen.findByRole('link', { name: 'Water' });

  await user.type(screen.getByRole('searchbox', { name: 'Search habits by name' }), 'ru');
  await waitFor(() => expect(rowNames()).toEqual(['Run']));

  await user.clear(screen.getByRole('searchbox'));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Filter by category' }),
    'Learning',
  );
  await waitFor(() => expect(rowNames()).toEqual(['Read']));
});

it('reorders with the keyboard, keeping focus on the moved habit', async () => {
  const { user } = renderApp('/habits');
  const moveDown = await screen.findByRole('button', { name: 'Move Water down' });
  expect(screen.getByRole('button', { name: 'Move Water up' })).toBeDisabled();

  moveDown.focus();
  await user.keyboard('{Enter}');

  await waitFor(() => expect(rowNames()).toEqual(['Run', 'Water', 'Read']));
  expect(screen.getByRole('button', { name: 'Move Water down' })).toHaveFocus();
  expect(screen.getByText('Water moved to position 2 of 3.')).toBeInTheDocument();
  await waitFor(() =>
    expect([...db.habits].sort((a, b) => a.sortOrder - b.sortOrder).map((h) => h.name)).toEqual([
      'Run',
      'Water',
      'Read',
    ]),
  );
});
