/**
 * The Today page: first-run empty state and templates, optimistic ticking (and rollback on a
 * server error), groups, date navigation (buttons, keyboard, URL) and read-only future days.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { DateTime } from 'luxon';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { db, fakeToday, makeHabit } from '../test/fakeHabits.js';
import { currentUrl, renderApp } from '../test/renderApp.jsx';
import { backend, server } from '../test/server.js';

beforeEach(() => {
  backend.loggedIn = true;
});

const toggleFor = (name) => screen.findByRole('button', { name: `Mark ${name} complete` });

describe('first run', () => {
  it('welcomes a new user with templates and a create button', async () => {
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: "Let's build your first habit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first habit' })).toBeInTheDocument();
    for (const name of ['Drink water', 'Exercise', 'Read', 'Meditate']) {
      expect(screen.getByRole('button', { name: new RegExp(`Add “${name}”`) })).toBeInTheDocument();
    }
  });

  it('a template creates the habit in one click and it appears on Today', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Add “Drink water”/ }));
    expect(await toggleFor('Drink water')).toHaveAttribute('aria-pressed', 'false');
    expect(db.habits.map((h) => h.name)).toEqual(['Drink water']);
  });

  it('"Create your first habit" opens the habit form', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Create your first habit' }));
    expect(await screen.findByRole('dialog', { name: 'New habit' })).toBeInTheDocument();
  });
});

describe('ticking habits', () => {
  it('marks complete optimistically, before the server answers', async () => {
    db.habits.push(makeHabit({ name: 'Read 10 pages' }));
    let answered = false;
    server.use(
      http.put('/api/v1/habits/:id/completions/:date', async ({ params }) => {
        await delay(500); // a slow network: the UI must not wait for this
        db.completions.add(`${params.id}|${params.date}`);
        answered = true;
        return HttpResponse.json({ completion: {} }, { status: 201 });
      }),
    );
    const { user } = renderApp('/');
    const toggle = await toggleFor('Read 10 pages');
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();

    await user.click(toggle);
    // Ticking moves the row from "To do" to "Done" (a new element), so always re-query it.
    const current = () => screen.getByRole('button', { name: 'Mark Read 10 pages complete' });
    // Pressed and counted while the server has NOT answered yet; unavailable until it does, so a
    // second click can't race the first.
    await waitFor(() => expect(current()).toHaveAttribute('aria-pressed', 'true'));
    expect(answered).toBe(false);
    expect(current()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('1 of 1 done')).toBeInTheDocument();
    expect(screen.getByText(/All done for today/)).toBeInTheDocument();
    await user.click(current()); // ignored while in flight
    // Once the server answers, the toggle is usable again (and still pressed).
    await waitFor(() => expect(current()).not.toHaveAttribute('aria-disabled'));
    expect(answered).toBe(true);
    expect(current()).toHaveAttribute('aria-pressed', 'true');
    expect(db.completions.size).toBe(1);
  });

  it('rolls back and explains when the server fails (500)', async () => {
    db.habits.push(makeHabit({ name: 'Read 10 pages' }));
    server.use(
      http.put('/api/v1/habits/:id/completions/:date', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        ),
      ),
    );
    const { user } = renderApp('/');
    const toggle = await toggleFor('Read 10 pages');
    await user.click(toggle);

    expect(await screen.findByText(`Couldn't mark "Read 10 pages" done`)).toBeInTheDocument();
    // Re-query: the row moved to "Done" and back, so it is a new element.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark Read 10 pages complete' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(screen.getByRole('region', { name: /To do/ })).toBeInTheDocument();
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();
  });

  it('groups habits into To do and Done, and lists unscheduled ones separately', async () => {
    const today = fakeToday();
    const weekday = DateTime.fromISO(today).weekday;
    const otherDay = (weekday % 7) + 1;
    db.habits.push(makeHabit({ name: 'Water' }), makeHabit({ name: 'Stretch' }));
    db.habits.push(makeHabit({ name: 'Gym', frequencyType: 'weekdays', weekdays: [otherDay] }));
    db.completions.add(`${db.habits[1].id}|${today}`);

    renderApp('/');
    const todo = await screen.findByRole('region', { name: /To do/ });
    const done = screen.getByRole('region', { name: /Done/ });
    expect(within(todo).getByText('Water')).toBeInTheDocument();
    expect(within(done).getByText('Stretch')).toBeInTheDocument();
    expect(screen.getByText(/Not scheduled today \(1\)/)).toBeInTheDocument();
  });
});

it('keyboard users keep focus on the habit after it moves to Done', async () => {
  db.habits.push(makeHabit({ name: 'Water' }), makeHabit({ name: 'Stretch' }));
  const { user } = renderApp('/');
  const toggle = await toggleFor('Stretch');
  toggle.focus();
  await user.keyboard(' ');

  const done = await screen.findByRole('region', { name: /Done/ });
  const moved = within(done).getByRole('button', { name: 'Mark Stretch complete' });
  await waitFor(() => expect(moved).toHaveFocus());
});

describe('date navigation', () => {
  it('moves between days with buttons and arrow keys, keeping ?date= in the URL', async () => {
    db.habits.push(makeHabit({ name: 'Water' }));
    const today = fakeToday();
    const yesterday = DateTime.fromISO(today).minus({ days: 1 }).toISODate();
    const { user, router } = renderApp('/');

    await screen.findByRole('heading', { name: 'Today' });
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(currentUrl(router)).toBe(`/?date=${yesterday}`);
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(currentUrl(router)).toBe('/');
    await user.keyboard('{ArrowLeft}');
    expect(currentUrl(router)).toBe(`/?date=${yesterday}`);
  });

  it('past days are editable (back-filling)', async () => {
    db.habits.push(makeHabit({ name: 'Water' }));
    const yesterday = DateTime.fromISO(fakeToday()).minus({ days: 1 }).toISODate();
    const { user } = renderApp(`/?date=${yesterday}`);
    const toggle = await toggleFor('Water');
    expect(toggle).not.toHaveAttribute('aria-disabled');
    await user.click(toggle);
    await waitFor(() => expect(db.completions.has(`${db.habits[0].id}|${yesterday}`)).toBe(true));
  });

  it('future days are read-only', async () => {
    db.habits.push(makeHabit({ name: 'Water' }));
    const tomorrow = DateTime.fromISO(fakeToday()).plus({ days: 1 }).toISODate();
    renderApp(`/?date=${tomorrow}`);
    const toggle = await toggleFor('Water');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAccessibleDescription(/hasn't happened yet/);
    await userEvent.setup().click(toggle);
    expect(db.completions.size).toBe(0);
  });

  it('"n" opens the New habit form', async () => {
    db.habits.push(makeHabit({ name: 'Water' }));
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Today' });
    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New habit' })).toBeInTheDocument();
  });
});
