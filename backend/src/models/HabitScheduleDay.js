/**
 * HabitScheduleDay model: one ISO weekday a `weekdays` habit is scheduled on
 * (table `habit_schedule_days`). 1 = Monday ... 7 = Sunday, the same numbering as Luxon's
 * `DateTime.weekday` (NOT JavaScript's Date.getDay(), where Sunday is 0).
 */
import { DataTypes, Model } from 'sequelize';

export class HabitScheduleDay extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    HabitScheduleDay.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        habitId: { type: DataTypes.UUID, allowNull: false },
        weekday: {
          type: DataTypes.SMALLINT,
          allowNull: false,
          validate: { isInt: true, min: 1, max: 7 },
        },
      },
      {
        sequelize,
        modelName: 'HabitScheduleDay',
        tableName: 'habit_schedule_days',
        // Rows are replaced as a set when the schedule changes, never edited in place.
        updatedAt: false,
      },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    HabitScheduleDay.belongsTo(models.Habit, { foreignKey: 'habitId', as: 'habit' });
  }
}
