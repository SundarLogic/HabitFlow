/**
 * HabitCompletion model: "user U completed habit H on calendar date D"
 * (table `habit_completions`).
 *
 * completionDate is the user's local calendar day ('YYYY-MM-DD'); completedAt is the UTC
 * instant the completion was recorded. The DB allows one row per (habit, user, date).
 */
import { DataTypes, Model } from 'sequelize';

export class HabitCompletion extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    HabitCompletion.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        habitId: { type: DataTypes.UUID, allowNull: false },
        completedBy: { type: DataTypes.UUID, allowNull: false },
        completionDate: { type: DataTypes.DATEONLY, allowNull: false, validate: { isDate: true } },
        completedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        note: { type: DataTypes.STRING(280), allowNull: true, validate: { len: [0, 280] } },
      },
      { sequelize, modelName: 'HabitCompletion', tableName: 'habit_completions' },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    HabitCompletion.belongsTo(models.Habit, { foreignKey: 'habitId', as: 'habit' });
    HabitCompletion.belongsTo(models.User, { foreignKey: 'completedBy', as: 'completer' });
  }
}
