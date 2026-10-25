/**
 * The session cleanup job (jobs/sessionCleanup.js): deletes expired sessions and keeps the rest.
 * Time is controlled through the injected `now` clock.
 */
import { runSessionCleanup } from '../../src/jobs/sessionCleanup.js';
import { createLogger } from '../../src/config/logger.js';
import { Session } from '../../src/models/index.js';
import { truncateAllTables } from '../helpers/db.js';
import { createUser } from '../helpers/factories.js';
import { hashToken } from '../../src/utils/tokens.js';

const NOW = new Date('2026-10-25T03:00:00Z');
const silentLogger = createLogger({ level: 'silent' });

beforeEach(async () => {
  await truncateAllTables();
});

it('deletes sessions that expired at or before now, and keeps live ones', async () => {
  const user = await createUser();
  const session = (name, expiresAt) =>
    Session.create({ userId: user.id, tokenHash: hashToken(name), expiresAt });

  await session('expired-yesterday', new Date('2026-10-24T03:00:00Z'));
  await session('expires-exactly-now', NOW);
  const live = await session('expires-tomorrow', new Date('2026-10-26T03:00:00Z'));

  const deleted = await runSessionCleanup({ now: () => NOW, logger: silentLogger });

  expect(deleted).toBe(2);
  const remaining = await Session.findAll();
  expect(remaining.map((s) => s.id)).toEqual([live.id]);
});

it('does nothing when no session has expired', async () => {
  expect(await runSessionCleanup({ now: () => NOW, logger: silentLogger })).toBe(0);
});
