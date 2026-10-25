/**
 * The habit form (create and edit): fields that follow the chosen frequency, client validation
 * mirroring the API, the exact payload sent, reminders, server errors and the plan limit.
 */
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { db, makeHabit } from '../../test/fakeHabits.js';
import { renderApp } from '../../test/renderApp.jsx';
import { apiError, backend, server } from '../../test/server.js';

beforeEach(() => {
  backend.loggedIn = true;
});

/** Opens the New habit form from the Habits page and returns the user-event instance. */
async function openNewHabitForm() {
  const app = renderApp('/habits');
  await app.user.click(await screen.findByRole('button', { name: 'New habit' }));
  await screen.findByRole('dialog', { name: 'New habit' });
  return app;
}

/** Captures the body of the next POST /habits (and still creates the habit). */
function capturePost() {
  const seen = {};
  server.use(
    http.post('/api/v1/habits', async ({ request }) => {
      seen.body = await request.json();
      const habit = makeHabit(seen.body);
      db.habits.push(habit);
      return HttpResponse.json({ habit }, { status: 201 });
    }),
  );
  return seen;
}

it('shows the fields that match the frequency', async () => {
  const { user } = await openNewHabitForm();
  expect(screen.getByRole('radio', { name: 'Daily' })).toBeChecked();
  expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton', { name: 'Times per week' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: 'Specific days' }));
  expect(screen.getByRole('group', { name: 'Days' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked(); // default Mon-Fri

  await user.click(screen.getByRole('radio', { name: 'Times per week' }));
  expect(screen.queryByRole('group', { name: 'Days' })).not.toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Times per week' })).toHaveValue(3);
});

it('validates like the API: name required, at least one day', async () => {
  const { user } = await openNewHabitForm();
  await user.click(screen.getByRole('button', { name: 'Create habit' }));
  expect(await screen.findByText('Give your habit a name')).toBeInTheDocument();

  await user.type(screen.getByLabelText(/Name/), 'Gym');
  await user.click(screen.getByRole('radio', { name: 'Specific days' }));
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    await user.click(screen.getByRole('checkbox', { name: day }));
  }
  await user.click(screen.getByRole('button', { name: 'Create habit' }));
  expect(await screen.findByText('Pick at least one day')).toBeInTheDocument();
  expect(db.habits).toHaveLength(0);
});

it('the times-per-week stepper stays within 1-7', async () => {
  const { user } = await openNewHabitForm();
  await user.click(screen.getByRole('radio', { name: 'Times per week' }));
  const more = screen.getByRole('button', { name: 'One time more' });
  for (let i = 0; i < 6; i += 1) await user.click(more);
  expect(screen.getByRole('spinbutton', { name: 'Times per week' })).toHaveValue(7);
  expect(more).toBeDisabled();
});

it('sends only the fields that apply, then shows the new habit', async () => {
  const seen = capturePost();
  const { user } = await openNewHabitForm();
  await user.type(screen.getByLabelText(/Name/), 'Gym');
  await user.type(screen.getByLabelText(/Category/), 'Fitness');
  await user.click(screen.getByRole('radio', { name: 'Specific days' }));
  await user.click(screen.getByRole('checkbox', { name: 'Tuesday' })); // Mon-Fri -> Mon,Wed,Thu,Fri
  await user.click(screen.getByRole('radio', { name: 'Emerald' }));
  await user.click(screen.getByRole('radio', { name: 'Dumbbell' }));
  await user.click(screen.getByRole('button', { name: 'Create habit' }));

  await waitFor(() => expect(seen.body).toBeDefined());
  expect(seen.body).toMatchObject({
    name: 'Gym',
    category: 'Fitness',
    color: '#10B981',
    icon: 'dumbbell',
    frequencyType: 'weekdays',
    weekdays: [1, 3, 4, 5],
    targetPerWeek: null,
    description: null,
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByRole('link', { name: 'Gym' })).toBeInTheDocument();
});

it('creates reminders after the habit', async () => {
  const reminders = [];
  server.use(
    http.post('/api/v1/habits/:id/reminders', async ({ request }) => {
      reminders.push(await request.json());
      return HttpResponse.json({ reminder: { id: 'r1' } }, { status: 201 });
    }),
  );
  const { user } = await openNewHabitForm();
  await user.type(screen.getByLabelText(/Name/), 'Water');
  await user.click(screen.getByRole('button', { name: 'Add reminder' }));
  await user.click(screen.getByRole('button', { name: 'Create habit' }));
  await waitFor(() => expect(reminders).toEqual([{ remindAt: '08:00' }]));
});

it('explains the plan limit in plain words', async () => {
  server.use(
    http.post('/api/v1/habits', () =>
      apiError(403, 'PLAN_LIMIT_REACHED', 'Your plan allows up to 10 active habits', {
        limit: 10,
        current: 10,
      }),
    ),
  );
  const { user } = await openNewHabitForm();
  await user.type(screen.getByLabelText(/Name/), 'One too many');
  await user.click(screen.getByRole('button', { name: 'Create habit' }));
  expect(await screen.findByText(/Your free plan includes 10 active habits/)).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument(); // stays open, nothing lost
});

it('puts server validation errors under their fields', async () => {
  server.use(
    http.post('/api/v1/habits', () =>
      apiError(422, 'VALIDATION_ERROR', 'Request validation failed', [
        { location: 'body', path: 'startDate', message: 'must be on or before 2027-10-28' },
      ]),
    ),
  );
  const { user } = await openNewHabitForm();
  await user.type(screen.getByLabelText(/Name/), 'Later');
  await user.click(screen.getByRole('button', { name: 'Create habit' }));
  expect(await screen.findByText('Start date must be on or before 2027-10-28')).toBeInTheDocument();
});

it('edits an existing habit with its values pre-filled', async () => {
  db.habits.push(
    makeHabit({
      name: 'Run',
      frequencyType: 'weekly_target',
      targetPerWeek: 4,
      category: 'Fitness',
    }),
  );
  const { user } = renderApp('/habits');
  await user.click(await screen.findByRole('button', { name: 'Actions for Run' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

  expect(await screen.findByRole('dialog', { name: 'Edit "Run"' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Times per week' })).toBeChecked();
  expect(screen.getByRole('spinbutton', { name: 'Times per week' })).toHaveValue(4);
  const name = screen.getByLabelText(/Name/);
  await user.clear(name);
  await user.type(name, 'Morning run');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(db.habits[0].name).toBe('Morning run'));
});
