/**
 * Migration: create the `habit_schedule_days` table (the weekdays a `weekdays` habit runs on).
 *
 * One row per scheduled ISO weekday: 1 = Monday ... 7 = Sunday (Luxon's `weekday`, NOT JS
 * Date.getDay() where Sunday is 0). The rows of a habit are replaced as a set when its schedule
 * changes, so there is no updated_at.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'habit_schedule_days',
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
          weekday: { type: Sequelize.SMALLINT, allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE habit_schedule_days
           -- Each weekday at most once per habit. The index also serves lookups by habit_id.
           ADD CONSTRAINT habit_schedule_days_habit_weekday_unique UNIQUE (habit_id, weekday),
           ADD CONSTRAINT habit_schedule_days_weekday_range CHECK (weekday BETWEEN 1 AND 7)`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('habit_schedule_days');
  },
};
