/**
 * Migration: create the `users` table (one row per registered account).
 *
 * Also enables the pgcrypto extension, which provides gen_random_uuid() for the UUID primary
 * keys of every table. This is the first migration, so every later table can rely on it.
 *
 * Constraint conventions used by all HabitFlow migrations:
 *   - Every CHECK / UNIQUE constraint and index has an explicit name, so database errors say
 *     exactly which rule failed (e.g. "users_email_lowercase").
 *   - Enum-like columns are VARCHAR + CHECK instead of native Postgres ENUM types (see
 *     docs/DECISIONS.md ADR-024): adding a value later is a one-line constraint swap.
 *   - Everything runs in one transaction, so a failed migration leaves no half-built table.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // pgcrypto is a "trusted" extension since PG 13, so a non-superuser owner can create it.
      await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto', {
        transaction,
      });

      await queryInterface.createTable(
        'users',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          name: { type: Sequelize.STRING(100), allowNull: false },
          email: { type: Sequelize.STRING(254), allowNull: false },
          password_hash: { type: Sequelize.STRING(255), allowNull: false },
          timezone: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'UTC' },
          notification_preferences: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: Sequelize.literal(`'{"inApp": true, "reminders": true}'::jsonb`),
          },
          last_login_at: { type: Sequelize.DATE, allowNull: true },
          // Sequelize.DATE is TIMESTAMPTZ on Postgres. DB defaults make raw inserts work too.
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE users
           ADD CONSTRAINT users_email_unique UNIQUE (email),
           -- The app lowercases emails; this guarantees "A@x.com" and "a@x.com" can't both exist.
           ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
           ADD CONSTRAINT users_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
           -- Postgres can't validate IANA names; the model does (Luxon). This only blocks ''.
           ADD CONSTRAINT users_timezone_not_empty CHECK (char_length(timezone) > 0),
           ADD CONSTRAINT users_notification_preferences_object
             CHECK (jsonb_typeof(notification_preferences) = 'object')`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    // pgcrypto is deliberately left installed: it is harmless, other objects may use it, and
    // re-running `up` uses CREATE EXTENSION IF NOT EXISTS.
    await queryInterface.dropTable('users');
  },
};
