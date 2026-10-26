/**
 * The notification bell: unread badge in the button's name, the inbox panel (mark one read, mark
 * all read, link to the habit, Escape), and the polite announcement when new notifications arrive.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { db, makeHabit } from '../../test/fakeHabits.js';
import { currentUrl, renderApp } from '../../test/renderApp.jsx';
import { backend, makeNotification } from '../../test/server.js';
import { queryKeys } from '../../lib/queryClient.js';

beforeEach(() => {
  backend.loggedIn = true;
});

const bell = (name = /^Notifications/) => screen.findByRole('button', { name });

it('the badge updates after "Mark all read"', async () => {
  backend.notifications.push(
    makeNotification({ title: 'Gym' }),
    makeNotification({ title: '7-day streak!', type: 'streak_milestone' }),
  );
  const { user } = renderApp('/');
  await user.click(await bell('Notifications, 2 unread'));
  const panel = await screen.findByRole('dialog', { name: 'Notifications' });
  expect(await within(panel).findByText('7-day streak!')).toBeInTheDocument();

  await user.click(within(panel).getByRole('button', { name: 'Mark all read' }));
  expect(await bell('Notifications')).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  expect(backend.notifications.every((n) => n.readAt)).toBe(true);
  await waitFor(() =>
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toBeDisabled(),
  );
});

it('marks one notification read', async () => {
  backend.notifications.push(
    makeNotification({ title: 'Gym' }),
    makeNotification({ title: 'Read' }),
  );
  const { user } = renderApp('/');
  await user.click(await bell('Notifications, 2 unread'));
  await user.click(await screen.findByRole('button', { name: 'Mark read: Gym' }));
  expect(await bell('Notifications, 1 unread')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark read: Gym' })).not.toBeInTheDocument();
});

it('links to the habit and closes the panel', async () => {
  const habit = makeHabit({ name: 'Gym' });
  db.habits.push(habit);
  backend.notifications.push(
    makeNotification({ title: 'Gym', data: { habitId: habit.id, reminderId: 'r', date: '' } }),
  );
  const { user, router } = renderApp('/');
  await user.click(await bell('Notifications, 1 unread'));
  const panel = await screen.findByRole('dialog', { name: 'Notifications' });
  await user.click(await within(panel).findByRole('link', { name: 'Gym' }));
  expect(currentUrl(router)).toBe(`/habits/${habit.id}`);
  expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  await waitFor(() => expect(backend.notifications[0].readAt).not.toBeNull());
});

it('Escape closes the panel and returns focus to the bell', async () => {
  const { user } = renderApp('/');
  await user.click(await bell());
  expect(await screen.findByText(/You're all caught up/)).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  expect(await bell()).toHaveFocus();
});

it('announces new notifications politely when the count goes up', async () => {
  const { queryClient } = renderApp('/');
  await bell('Notifications');
  const status = screen
    .getAllByRole('status')
    .find((el) => el.getAttribute('aria-live') === 'polite' && el.closest('header'));
  expect(status).toHaveTextContent('');

  // A reminder arrives; the next poll (here: a forced refetch) sees the higher count.
  backend.notifications.push(makeNotification({ message: 'It’s time for "Gym".' }));
  await queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
  await waitFor(() => expect(status).toHaveTextContent('New: It’s time for "Gym".'));
  expect(await bell('Notifications, 1 unread')).toBeInTheDocument();
});
