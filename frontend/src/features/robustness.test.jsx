/**
 * Robustness (Phase 11): going offline, failed saves with Retry, the session expiring while the
 * app is open, and double submits.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import { db, makeHabit } from '../test/fakeHabits.js';
import { currentUrl, renderApp } from '../test/renderApp.jsx';
import { apiError, backend, server } from '../test/server.js';

beforeEach(() => {
  backend.loggedIn = true;
});

/** Simulates the browser losing / regaining its connection. */
function setOnline(online) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

afterEach(() => vi.restoreAllMocks());

const toggle = (name) => screen.findByRole('button', { name: `Mark ${name} complete` });

it('shows an offline banner, and "Back online" when the connection returns', async () => {
  renderApp('/');
  await screen.findByRole('heading', { name: 'Today' });
  setOnline(false);
  expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
  setOnline(true);
  expect(await screen.findByText('Back online')).toBeInTheDocument();
  expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
});

it('a save that fails on the network rolls back and offers Retry, which saves it', async () => {
  db.habits.push(makeHabit({ name: 'Read' }));
  let attempts = 0;
  server.use(
    http.put('/api/v1/habits/:id/completions/:date', ({ params }) => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.error(); // connection dropped
      db.completions.add(`${params.id}|${params.date}`);
      return HttpResponse.json({ completion: {} }, { status: 201 });
    }),
  );
  const { user } = renderApp('/');
  await user.click(await toggle('Read'));

  const errors = await screen.findByRole('list', { name: 'Errors' });
  expect(await within(errors).findByText(`Couldn't mark "Read" done`)).toBeInTheDocument();
  expect(within(errors).getByText(/Check your connection/)).toBeInTheDocument();
  await waitFor(async () => expect(await toggle('Read')).toHaveAttribute('aria-pressed', 'false'));

  await user.click(within(errors).getByRole('button', { name: 'Retry' }));
  await waitFor(async () => expect(await toggle('Read')).toHaveAttribute('aria-pressed', 'true'));
  expect(attempts).toBe(2);
});

it('when the session expires mid-use, explains it and goes to login (no "couldn\'t save" noise)', async () => {
  db.habits.push(makeHabit({ name: 'Read' }));
  const { user, router, queryClient } = renderApp('/habits');
  await screen.findByRole('heading', { name: 'Habits' });

  // The session ends on the server (expired, or logged out on another device).
  backend.loggedIn = false;
  server.use(
    http.get('/api/v1/habits', () => apiError(401, 'UNAUTHENTICATED', 'Authentication required')),
    http.get('/api/v1/today', () => apiError(401, 'UNAUTHENTICATED', 'Authentication required')),
  );
  // The next request the page makes (here: a refetch) gets 401 UNAUTHENTICATED.
  await act(() => queryClient.invalidateQueries({ queryKey: ['habits'] }));

  await waitFor(() => expect(currentUrl(router)).toBe('/login?returnTo=%2Fhabits'));
  expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
  expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
  // Logging in again returns to the page the user was on.
  await user.type(await screen.findByLabelText(/Email/), 'ana@example.com');
  await user.type(screen.getByLabelText(/Password/), 'correct-horse-42');
  server.resetHandlers();
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => expect(currentUrl(router)).toBe('/habits'));
});

it('a double click on a template creates the habit once', async () => {
  let created = 0;
  server.use(
    http.post('/api/v1/habits', async ({ request }) => {
      created += 1;
      await delay(200);
      const habit = makeHabit(await request.json());
      db.habits.push(habit);
      return HttpResponse.json({ habit }, { status: 201 });
    }),
  );
  const { user } = renderApp('/');
  const template = await screen.findByRole('button', { name: /Add “Drink water”/ });
  await user.dblClick(template);
  expect(await toggle('Drink water')).toBeInTheDocument();
  expect(created).toBe(1);
});
