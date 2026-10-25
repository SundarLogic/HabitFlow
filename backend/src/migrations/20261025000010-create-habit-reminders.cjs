/**
 * Migration: create the `habit_reminders` table (when to remind a user about a habit).
 *
 * remind_at is a wall-clock TIME in the user's timezone (e.g. 07:30 means 07:30 wherever the
 * user lives, across DST changes), not a UTC instant. weekdays narrows the reminder to some
 * ISO weekdays; NULL means "every scheduled day of the habit".
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'habit_reminders',
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
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          remind_at: { type: Sequelize.TIME, allowNull: false },
          weekdays: { type: Sequelize.ARRAY(Sequelize.SMALLINT), allowNull: true },
          enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE habit_reminders
           -- No two identical reminders for the same habit and user. Also indexes habit_id.
           ADD CONSTRAINT habit_reminders_habit_user_time_unique UNIQUE (habit_id, user_id, remind_at),
           -- NULL = every scheduled day; otherwise a non-empty list of ISO weekdays 1-7.
           -- (<@ means "is contained in"; cardinality() is the array length.)
           ADD CONSTRAINT habit_reminders_weekdays_valid CHECK (
             weekdays IS NULL
             OR (cardinality(weekdays) >= 1 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
           )`,
        { transaction },
      );
      // The reminder cron job scans enabled reminders.
      await queryInterface.addIndex('habit_reminders', ['enabled'], {
        name: 'habit_reminders_enabled_idx',
        transaction,
      });
      await queryInterface.addIndex('habit_reminders', ['user_id'], {
        name: 'habit_reminders_user_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('habit_reminders');
  },
};
