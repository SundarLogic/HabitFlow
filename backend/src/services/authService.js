/**
 * Auth service: signup, login, logout and session lookup (CLAUDE.md §3.1, ADR-002).
 *
 * Request flow: authRoutes -> validators -> authController -> THIS FILE -> models.
 * The requireAuth middleware calls resolveSession() on every protected request.
 *
 * Sessions in one paragraph: login creates a random token. The client keeps the raw token
 * (hf_session cookie or Bearer header) and the sessions table keeps only sha256(token). On each
 * request we hash what the client sent and look it up. Logout deletes the row, which revokes
 * the token immediately. Expiry slides: using a session pushes expires_at forward again.
 *
 * Every function takes an optional `now` clock so tests can control time.
 */
import net from 'node:net';
import { Op, UniqueConstraintError } from 'sequelize';
import { SESSION_TOUCH_INTERVAL_MS, SESSION_TTL_MS } from '../config/auth.js';
import {
  Plan,
  sequelize,
  Session,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
} from '../models/index.js';
import { ConflictError, UnauthorizedError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken, hashToken } from '../utils/tokens.js';

const WORKSPACE_SUFFIX = "'s Habits";
const WORKSPACE_NAME_MAX = 100;
const USER_AGENT_MAX = 512;

/**
 * @typedef {object} ClientInfo where a login came from, stored on the session for the user's
 *   "active sessions" overview later
 * @property {string} [userAgent]
 * @property {string} [ip]
 *
 * @typedef {object} NewSession what the controller needs to set the cookies
 * @property {string} token the RAW token: send to the client, never store or log it
 * @property {Date} expiresAt
 * @property {Date} now the moment the session was created
 */

/** Postgres INET rejects IPv6 zone ids ("fe80::1%eth0") and garbage, so store null instead. */
function toInet(ip) {
  return typeof ip === 'string' && net.isIP(ip) && !ip.includes('%') ? ip : null;
}

/**
 * Inserts a session row and returns the raw token (shown to the client exactly once).
 * @returns {Promise<NewSession>}
 */
async function createSession(userId, client, { now, transaction }) {
  const token = generateToken();
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  await Session.create(
    {
      userId,
      tokenHash: hashToken(token),
      userAgent: client.userAgent ? client.userAgent.slice(0, USER_AGENT_MAX) : null,
      ip: toInet(client.ip),
      expiresAt,
      lastUsedAt: createdAt,
    },
    { transaction },
  );
  return { token, expiresAt, now: createdAt };
}

/**
 * Registers a user. In ONE transaction (all or nothing): user -> personal workspace -> owner
 * membership -> free-plan subscription -> first session. If any step fails, no user row is left.
 *
 * @param {{ name: string, email: string, password: string, timezone: string }} input validated
 *   by validators/authValidators.js (email already trimmed + lowercased)
 * @param {ClientInfo} [client]
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<{ user: User, session: NewSession }>}
 * @throws {ConflictError} 409 EMAIL_TAKEN
 */
export async function signup(
  { name, email, password, timezone },
  client = {},
  { now = systemNow } = {},
) {
  // Hash BEFORE opening the transaction: bcrypt takes ~250 ms and we shouldn't hold a DB
  // connection (and its locks) while it runs.
  const passwordHash = await hashPassword(password);

  try {
    return await sequelize.transaction(async (transaction) => {
      const freePlan = await Plan.findOne({ where: { code: 'free' }, transaction });
      if (!freePlan) {
        // A deployment problem, not a user error, so it becomes a logged 500.
        throw new Error('The "free" plan is missing. Run `npm run db:seed`.');
      }

      const user = await User.create({ name, email, passwordHash, timezone }, { transaction });
      const workspace = await Workspace.create(
        {
          // Keep "<name>'s Habits" within the 100-character column limit.
          name: `${name.slice(0, WORKSPACE_NAME_MAX - WORKSPACE_SUFFIX.length)}${WORKSPACE_SUFFIX}`,
          ownerUserId: user.id,
          workspaceType: 'personal',
        },
        { transaction },
      );
      await WorkspaceMember.create(
        { workspaceId: workspace.id, userId: user.id, role: 'owner' },
        { transaction },
      );
      await WorkspaceSubscription.create(
        { workspaceId: workspace.id, planId: freePlan.id, status: 'active' },
        { transaction },
      );
      const session = await createSession(user.id, client, { now, transaction });
      return { user, session };
    });
  } catch (err) {
    // Checking the UNIQUE constraint (instead of "SELECT then INSERT") is race-free: two
    // simultaneous signups with one email can't both succeed.
    if (err instanceof UniqueConstraintError && err.original?.constraint === 'users_email_unique') {
      throw new ConflictError('An account with this email already exists', { code: 'EMAIL_TAKEN' });
    }
    throw err;
  }
}

/**
 * Checks credentials and opens a session.
 *
 * Unknown email and wrong password produce the SAME error after the SAME amount of work
 * (bcrypt always runs), so attackers can't discover which emails are registered.
 *
 * @param {{ email: string, password: string }} credentials email already normalised
 * @param {ClientInfo} [client]
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<{ user: User, session: NewSession }>}
 * @throws {UnauthorizedError} 401 INVALID_CREDENTIALS
 */
export async function login({ email, password }, client = {}, { now = systemNow } = {}) {
  // 'withPassword' is the only scope that loads passwordHash (see models/User.js).
  const user = await User.scope('withPassword').findOne({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    throw new UnauthorizedError('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  }

  return sequelize.transaction(async (transaction) => {
    await user.update({ lastLoginAt: now() }, { transaction });
    const session = await createSession(user.id, client, { now, transaction });
    return { user, session };
  });
}

/**
 * Finds the session for a raw token. Expired sessions are deleted and treated as missing.
 * Sliding expiry: if the session was last recorded as used more than 5 minutes ago,
 * last_used_at and expires_at are moved forward (so active users stay logged in).
 *
 * @param {string | undefined} token raw token from the cookie or Bearer header
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<{ session: Session, user: User, refreshed: boolean } | null>}
 *   null when there is no valid session; refreshed = expiresAt changed (re-send the cookie)
 */
export async function resolveSession(token, { now = systemNow } = {}) {
  if (!token) return null;
  const session = await Session.findOne({
    where: { tokenHash: hashToken(token) },
    // The User default scope excludes passwordHash, so it isn't loaded here.
    include: [{ association: 'user', required: true }],
  });
  if (!session) return null;

  const current = now();
  if (session.expiresAt <= current) {
    await session.destroy();
    return null;
  }

  let refreshed = false;
  if (current.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await session.update({
      lastUsedAt: current,
      expiresAt: new Date(current.getTime() + SESSION_TTL_MS),
    });
    refreshed = true;
  }
  return { session, user: session.user, refreshed };
}

/**
 * Logs out one session (this device). Deleting the row revokes the token immediately.
 * @param {string} sessionId
 */
export async function logout(sessionId) {
  await Session.destroy({ where: { id: sessionId } });
}

/**
 * Logs a user out everywhere, optionally keeping one session (e.g. the device that just
 * changed the password).
 * @param {string} userId
 * @param {{ exceptSessionId?: string, transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<number>} number of sessions deleted
 */
export function logoutAll(userId, { exceptSessionId, transaction } = {}) {
  const where = { userId };
  if (exceptSessionId) where.id = { [Op.ne]: exceptSessionId };
  return Session.destroy({ where, transaction });
}

/**
 * Deletes every expired session. Run daily by the housekeeping job (jobs/housekeeping.js).
 * Expired sessions are already rejected on use; this only keeps the table small.
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<number>} number of sessions deleted
 */
export function purgeExpiredSessions({ now = systemNow } = {}) {
  return Session.destroy({ where: { expiresAt: { [Op.lte]: now() } } });
}
