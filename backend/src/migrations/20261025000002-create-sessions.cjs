/**
 * Migration: create the `sessions` table (server-side login sessions, CLAUDE.md §3.1).
 *
 * The browser holds a random token in the hf_session cookie; we store only its SHA-256 hash
 * (token_hash), so a database leak exposes no usable tokens. Logging out deletes the row.
 * Sessions have no updated_at: last_used_at is the only field that changes.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'sessions',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            // Deleting a user logs them out everywhere.
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          // Hex-encoded SHA-256 = exactly 64 characters.
          token_hash: { type: Sequelize.CHAR(64), allowNull: false },
          user_agent: { type: Sequelize.STRING(512), allowNull: true },
          ip: { type: Sequelize.INET, allowNull: true },
          expires_at: { type: Sequelize.DATE, allowNull: false },
          last_used_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE sessions
           ADD CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash),
           ADD CONSTRAINT sessions_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$')`,
        { transaction },
      );
      // "Log out all my devices" looks sessions up by user.
      await queryInterface.addIndex('sessions', ['user_id'], {
        name: 'sessions_user_id_idx',
        transaction,
      });
      // The purge cron job deletes WHERE expires_at < now().
      await queryInterface.addIndex('sessions', ['expires_at'], {
        name: 'sessions_expires_at_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sessions');
  },
};
