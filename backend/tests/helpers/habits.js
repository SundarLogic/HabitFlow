/**
 * Helpers for habit endpoint tests. `ctx` is what signupAgent() returns ({ agent, csrfToken }).
 *
 *   const ctx = await signupAgent(app);
 *   const habit = await createHabitViaApi(ctx, { name: 'Run', frequencyType: 'weekly_target', targetPerWeek: 3 });
 *   const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { name: 'Jog' });
 */

/**
 * Sends a request as the logged-in user, with the CSRF header unsafe methods need.
 * @param {{ agent: import('supertest').Agent, csrfToken: string }} ctx
 * @param {'get' | 'post' | 'patch' | 'put' | 'delete'} method
 * @param {string} url
 * @param {object} [body]
 * @param {Record<string, string>} [headers] e.g. { 'X-Workspace-Id': id }
 * @returns {import('supertest').Test}
 */
export function call(ctx, method, url, body, headers = {}) {
  let req = ctx.agent[method](url).set('X-CSRF-Token', ctx.csrfToken);
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return body === undefined ? req : req.send(body);
}

/**
 * Creates a habit through POST /api/v1/habits (a daily habit unless overridden) and returns it.
 * Throws with the response body if the API refuses, so test failures are easy to read.
 * @returns {Promise<object>} the public habit JSON
 */
export async function createHabitViaApi(ctx, body = {}, headers = {}) {
  const res = await call(
    ctx,
    'post',
    '/api/v1/habits',
    { name: 'Drink water', frequencyType: 'daily', ...body },
    headers,
  );
  if (res.status !== 201) {
    throw new Error(`create habit failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.habit;
}
