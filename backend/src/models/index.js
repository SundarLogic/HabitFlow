/**
 * models/index.js — creates the single shared Sequelize instance (our connection to PostgreSQL).
 *
 * Sequelize is an ORM ("Object-Relational Mapper"): it lets us work with database rows as
 * JavaScript objects (models) instead of writing raw SQL everywhere.
 *
 * Everyone imports `sequelize` from this file, so the whole app shares one connection pool.
 * Later phases will define models (User, Habit, ...) and their relationships here.
 *
 * IMPORTANT: never call sequelize.sync() in app code. sync() changes tables automatically and
 * can lose data. All schema changes go through migration files in src/migrations.
 */
import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';
// database.cjs is a CommonJS file (shared with sequelize-cli). ES modules can import CommonJS
// files; its module.exports object becomes the default import.
import databaseConfig from '../config/database.cjs';

// Pick the settings for the current environment: development, test or production.
// `url` is set when a full connection string is used; `options` holds everything else.
const { url, ...options } = databaseConfig[env.NODE_ENV];

// Sequelize accepts either a connection URL plus options, or just an options object
// containing host/port/username/password/database.
export const sequelize = url ? new Sequelize(url, options) : new Sequelize(options);
