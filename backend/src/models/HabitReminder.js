/**
 * HabitReminder model: when to remind a user about a habit (table `habit_reminders`).
 *
 * remindAt is a wall-clock time 'HH:MM[:SS]' in the USER's timezone, so a 07:30 reminder stays
 * at 07:30 local time across daylight-saving changes. weekdays (ISO 1-7) limits the reminder
 * to some days; null means every scheduled day of the habit.
 */
import { DataTypes, Model } from 'sequelize';
import { ISO_WEEKDAYS } from './constants.js';

export class HabitReminder extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    HabitReminder.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        habitId: { type: DataTypes.UUID, allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        remindAt: {
          type: DataTypes.TIME,
          allowNull: false,
          validate: {
            is: {
              args: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
              msg: 'remindAt must be HH:MM or HH:MM:SS (24-hour)',
            },
          },
        },
        weekdays: {
          type: DataTypes.ARRAY(DataTypes.SMALLINT),
          allowNull: true,
          validate: {
            isIsoWeekdayList(value) {
              // Sequelize skips built-in validators for null, but still runs custom ones.
              if (value === null || value === undefined) return;
              const valid =
                Array.isArray(value) &&
                value.length >= 1 &&
                value.every((day) => ISO_WEEKDAYS.includes(day));
              if (!valid) throw new Error('weekdays must be null or a non-empty list of 1-7');
            },
          },
        },
        enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      },
      { sequelize, modelName: 'HabitReminder', tableName: 'habit_reminders' },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    HabitReminder.belongsTo(models.Habit, { foreignKey: 'habitId', as: 'habit' });
    HabitReminder.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}
