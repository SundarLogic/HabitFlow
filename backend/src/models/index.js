/**
 * models/index.js — creates the single shared Sequelize instance (our connection to PostgreSQL).
 *
 * Sequelize is an ORM ("Object-Relational Mapper"): it lets us work with database rows as
 * JavaScript objects (models) instead of writing raw SQL everywhere.
 *
 * Everyone imports `sequelize` and the models from this file, so the whole app shares one
 * connection pool and one set of model classes:
 *   import { sequelize, User, Habit } from '../models/index.js';
 *
 * Each model lives in its own file and exposes two static methods:
 *   initModel(sequelize)  defines its columns and validation
 *   associate(models)     defines its relationships (hasMany, belongsTo, ...)
 * All models must be initialised before ANY association is defined, because an association
 * needs both of its models to exist. That's why there are two loops below.
 *
 * IMPORTANT: never call sequelize.sync() in app code. sync() changes tables automatically and
 * can lose data. All schema changes go through migration files in src/migrations.
 */
import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createSlowQueryLogger } from '../observability/slowQueries.js';
import { Habit } from './Habit.js';
import { HabitCompletion } from './HabitCompletion.js';
import { HabitReminder } from './HabitReminder.js';
import { HabitScheduleDay } from './HabitScheduleDay.js';
import { Notification } from './Notification.js';
import { Plan } from './Plan.js';
import { Session } from './Session.js';
import { User } from './User.js';
import { Workspace } from './Workspace.js';
import { WorkspaceMember } from './WorkspaceMember.js';
import { WorkspaceSubscription } from './WorkspaceSubscription.js';
// database.cjs is a CommonJS file (shared with sequelize-cli). ES modules can import CommonJS
// files; its module.exports object becomes the default import.
import databaseConfig from '../config/database.cjs';

// Pick the settings for the current environment: development, test or production.
// `url` is set when a full connection string is used; `options` holds everything else.
const { url, ...configOptions } = databaseConfig[env.NODE_ENV];

// The app (not the CLI) times every query and logs the slow ones (observability/slowQueries.js).
const options = {
  ...configOptions,
  benchmark: true,
  logging: createSlowQueryLogger({ logger, thresholdMs: env.SLOW_QUERY_MS }),
};

// Sequelize accepts either a connection URL plus options, or just an options object
// containing host/port/username/password/database.
export const sequelize = url ? new Sequelize(url, options) : new Sequelize(options);

/** Every model, keyed by name. Passed to associate() and handy for loops in tests. */
export const models = {
  User,
  Session,
  Plan,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
  Habit,
  HabitScheduleDay,
  HabitCompletion,
  HabitReminder,
  Notification,
};

for (const model of Object.values(models)) model.initModel(sequelize);
for (const model of Object.values(models)) model.associate(models);

export {
  User,
  Session,
  Plan,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
  Habit,
  HabitScheduleDay,
  HabitCompletion,
  HabitReminder,
  Notification,
};
