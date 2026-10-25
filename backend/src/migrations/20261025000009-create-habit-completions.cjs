/**
 * Migration: create the `habit_completions` table (one row = "user U did habit H on date D").
 *
 * completion_date is a calendar date in the user's timezone (DATE, no time part);
 * completed_at is the real instant the row was written (TIMESTAMPTZ, UTC). Streaks and rates
 * are derived from these rows on read, never stored.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'habit_completions',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          habit_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'habits', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          completed_by: {
            type: Sequelize.UUID,
            allowNull: false,
            // RESTRICT: history is never lost silently. Personal completions go away through
            // habit -> workspace CASCADE when an account is deleted.
            references: { model: 'users', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          completion_date: { type: Sequelize.DATEONLY, allowNull: false },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('now'),
          },
          note: { type: Sequelize.STRING(280), allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE habit_completions
           -- ADR-005: one completion per habit, per user, per calendar day.
           ADD CONSTRAINT habit_completions_habit_user_date_unique
             UNIQUE (habit_id, completed_by, completion_date),
           ADD CONSTRAINT habit_completions_note_length CHECK (char_length(note) <= 280)`,
        { transaction },
      );
      // History / streak queries: "completions of habit H between dates A and B".
      await queryInterface.addIndex('habit_completions', ['habit_id', 'completion_date'], {
        name: 'habit_completions_habit_id_date_idx',
        transaction,
      });
      // Cross-habit history: "everything user U completed between A and B".
      await queryInterface.addIndex('habit_completions', ['completed_by', 'completion_date'], {
        name: 'habit_completions_completed_by_date_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('habit_completions');
  },
};
