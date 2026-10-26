/**
 * Settings: profile name (email read-only), timezone (searchable, invalidates Today and every
 * other date-dependent query), notification preferences, password change (wrong current password
 * under its field), plan usage and deleting the account (password + typed confirmation).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { db, makeHabit } from '../test/fakeHabits.js';
import { currentUrl, renderApp } from '../test/renderApp.jsx';
import { backend } from '../test/server.js';

beforeAll(() => import('./SettingsPage.jsx'));

beforeEach(() => {
  backend.loggedIn = true;
});

const section = (name) => screen.findByRole('region', { name });

it('saves the name and shows the email read-only', async () => {
  const { user } = renderApp('/settings');
  const profile = await section('Profile');
  expect(within(profile).getByLabelText('Email')).toHaveAttribute('readonly');
  const name = within(profile).getByRole('textbox', { name: /Name/ });
  await user.clear(name);
  await user.type(name, 'Ana Maria Lima');
  await user.click(within(profile).getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByText('Profile saved')).toBeInTheDocument();
  expect(backend.user.name).toBe('Ana Maria Lima');
});

it('a timezone change invalidates the Today query (and other date-dependent data)', async () => {
  const { user, router, queryClient } = renderApp('/');
  await screen.findByRole('heading', { name: 'Today' });
  const todayQueries = () => queryClient.getQueryCache().findAll({ queryKey: ['today'] });
  expect(todayQueries().length).toBeGreaterThan(0);
  expect(todayQueries().every((q) => !q.state.isInvalidated)).toBe(true);

  await act(() => router.navigate('/settings'));
  const timezone = await section('Timezone');
  expect(within(timezone).getByText(/changes which date counts as "today"/)).toBeInTheDocument();
  const field = within(timezone).getByRole('combobox', { name: /Timezone/ });
  await user.clear(field);
  await user.type(field, 'Asia/Tokyo');
  await user.click(within(timezone).getByRole('button', { name: 'Save timezone' }));

  expect(await screen.findByText('Timezone set to Asia/Tokyo')).toBeInTheDocument();
  expect(backend.user.timezone).toBe('Asia/Tokyo');
  expect(todayQueries().every((q) => q.state.isInvalidated)).toBe(true);
});

it('rejects a timezone that is not in the list', async () => {
  const { user } = renderApp('/settings');
  const timezone = await section('Timezone');
  const field = within(timezone).getByRole('combobox', { name: /Timezone/ });
  await user.clear(field);
  await user.type(field, 'Mars/Olympus');
  await user.click(within(timezone).getByRole('button', { name: 'Save timezone' }));
  expect(await within(timezone).findByText(/Pick a timezone from the list/)).toBeInTheDocument();
  expect(backend.user).toBeNull();
});

it('switches reminders off', async () => {
  const { user } = renderApp('/settings');
  const prefs = await section('Notifications');
  const reminders = within(prefs).getByRole('checkbox', { name: 'Habit reminders' });
  expect(reminders).toBeChecked();
  await user.click(reminders);
  await waitFor(() => expect(reminders).not.toBeChecked());
  expect(backend.user.notificationPreferences).toEqual({ inApp: true, reminders: false });
});

it('changing the password says other devices were logged out; a wrong current password shows under its field', async () => {
  const { user } = renderApp('/settings');
  const form = await section('Password');
  expect(within(form).getByText(/logs you out on every other device/)).toBeInTheDocument();

  await user.type(within(form).getByLabelText(/Current password/), 'wrong-pass-1');
  await user.type(within(form).getByLabelText(/^New password/), 'brand-new-pass-7');
  await user.type(within(form).getByLabelText(/Confirm new password/), 'brand-new-pass-7');
  await user.click(within(form).getByRole('button', { name: 'Change password' }));
  expect(await within(form).findByText('Current password is incorrect')).toBeInTheDocument();

  await user.clear(within(form).getByLabelText(/Current password/));
  await user.type(within(form).getByLabelText(/Current password/), 'correct-horse-42');
  await user.click(within(form).getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('Your other devices have been logged out.')).toBeInTheDocument();
});

it('shows the plan and how many active habits it allows', async () => {
  db.habits.push(
    ...Array.from({ length: 6 }, (_, i) => makeHabit({ name: `Habit ${i}` })),
    makeHabit({ name: 'Old', status: 'archived' }),
  );
  renderApp('/settings');
  const plan = await section('Plan');
  expect(within(plan).getByText('Free plan')).toBeInTheDocument();
  expect(await within(plan).findByText('6 of 10 active habits')).toBeInTheDocument();
  expect(within(plan).getByText('Coming soon')).toBeInTheDocument();
});

it('deletes the account only with the password and the typed confirmation', async () => {
  const { user, router } = renderApp('/settings');
  await user.click(
    within(await section('Danger zone')).getByRole('button', { name: 'Delete account' }),
  );
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete your account?' });
  await user.type(within(dialog).getByLabelText(/Password/), 'correct-horse-42');
  await user.type(within(dialog).getByLabelText(/Type DELETE/), 'delete');
  await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
  expect(
    await within(dialog).findByText('Type DELETE in capital letters to confirm'),
  ).toBeInTheDocument();
  expect(backend.loggedIn).toBe(true);

  await user.clear(within(dialog).getByLabelText(/Type DELETE/));
  await user.type(within(dialog).getByLabelText(/Type DELETE/), 'DELETE');
  await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
  await waitFor(() => expect(currentUrl(router)).toBe('/signup'));
  expect(backend.loggedIn).toBe(false);
  expect(await screen.findByText('Your account has been deleted')).toBeInTheDocument();
});
