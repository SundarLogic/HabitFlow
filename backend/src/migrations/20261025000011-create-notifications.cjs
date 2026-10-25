/**
 * Migration: create the `notifications` table (in-app notifications for one user).
 *
 * The model is delivery-agnostic so push/email can be added later. dedupe_key lets the cron
 * job that generates notifications run twice without creating duplicates, e.g.
 * 'reminder:<reminderId>:2026-10-25'. Postgres allows many NULLs under a UNIQUE constraint, so
 * notifications without a key are unaffected. Rows are immutable apart from read_at, so there
 * is no updated_at; rows older than 90 days are purged by a cron job.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'notifications',
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
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          type: { type: Sequelize.STRING(32), allowNull: false },
          title: { type: Sequelize.STRING(120), allowNull: false },
          message: { type: Sequelize.STRING(500), allowNull: false },
          data: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: Sequelize.literal(`'{}'::jsonb`),
          },
          dedupe_key: { type: Sequelize.STRING(200), allowNull: true },
          read_at: { type: Sequelize.DATE, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE notifications
           ADD CONSTRAINT notifications_dedupe_key_unique UNIQUE (dedupe_key),
           ADD CONSTRAINT notifications_type_valid
             CHECK (type IN ('habit_reminder', 'streak_milestone', 'system')),
           ADD CONSTRAINT notifications_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
           ADD CONSTRAINT notifications_message_length CHECK (char_length(message) BETWEEN 1 AND 500),
           ADD CONSTRAINT notifications_data_object CHECK (jsonb_typeof(data) = 'object')`,
        { transaction },
      );
      // The inbox query: "this user's (unread) notifications, newest first".
      await queryInterface.sequelize.query(
        `CREATE INDEX notifications_user_read_created_idx
           ON notifications (user_id, read_at, created_at DESC)`,
        { transaction },
      );
      // The 90-day purge job deletes WHERE created_at < cutoff.
      await queryInterface.addIndex('notifications', ['created_at'], {
        name: 'notifications_created_at_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
