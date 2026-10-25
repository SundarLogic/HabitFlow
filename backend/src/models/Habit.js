/**
 * Habit model: a recurring habit inside a workspace (table `habits`).
 *
 * Schedule rules (CLAUDE.md §3.1):
 *   daily          every day from startDate
 *   weekdays       the ISO weekdays in scheduleDays (HabitScheduleDay rows)
 *   weekly_target  targetPerWeek (1-7) completions per ISO week
 * The model-level validators below mirror the DB CHECK constraints, so services get a readable
 * Sequelize ValidationError (422) before the database is even asked.
 */
import { DataTypes, Model } from 'sequelize';
import { FREQUENCY_TYPES, HABIT_STATUSES } from './constants.js';

export class Habit extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    Habit.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        workspaceId: { type: DataTypes.UUID, allowNull: false },
        createdBy: { type: DataTypes.UUID, allowNull: false },
        name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [1, 100] } },
        description: { type: DataTypes.STRING(500), allowNull: true, validate: { len: [0, 500] } },
        category: { type: DataTypes.STRING(50), allowNull: true, validate: { len: [1, 50] } },
        color: {
          type: DataTypes.STRING(7),
          allowNull: true,
          validate: { is: { args: /^#[0-9A-Fa-f]{6}$/, msg: 'color must look like #12abEF' } },
        },
        icon: { type: DataTypes.STRING(50), allowNull: true, validate: { len: [1, 50] } },
        frequencyType: {
          type: DataTypes.STRING(16),
          allowNull: false,
          validate: { isIn: { args: [FREQUENCY_TYPES], msg: 'invalid frequencyType' } },
        },
        targetPerWeek: { type: DataTypes.SMALLINT, allowNull: true },
        // DATEONLY = calendar date 'YYYY-MM-DD', no time or timezone attached.
        startDate: { type: DataTypes.DATEONLY, allowNull: false, validate: { isDate: true } },
        status: {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: 'active',
          validate: { isIn: { args: [HABIT_STATUSES], msg: 'invalid status' } },
        },
        archivedAt: { type: DataTypes.DATE, allowNull: true },
        sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      },
      {
        sequelize,
        modelName: 'Habit',
        tableName: 'habits',
        // Model-wide validators run after the per-field ones and can compare several fields.
        validate: {
          targetPerWeekMatchesFrequency() {
            if (this.frequencyType === 'weekly_target') {
              const target = this.targetPerWeek;
              if (!Number.isInteger(target) || target < 1 || target > 7) {
                throw new Error('targetPerWeek must be 1-7 for weekly_target habits');
              }
            } else if (this.targetPerWeek !== null && this.targetPerWeek !== undefined) {
              throw new Error('targetPerWeek is only allowed for weekly_target habits');
            }
          },
          archivedAtMatchesStatus() {
            const hasArchivedAt = this.archivedAt !== null && this.archivedAt !== undefined;
            if ((this.status === 'archived') !== hasArchivedAt) {
              throw new Error('archivedAt must be set exactly when status is archived');
            }
          },
        },
      },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    Habit.belongsTo(models.Workspace, { foreignKey: 'workspaceId', as: 'workspace' });
    Habit.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Habit.hasMany(models.HabitScheduleDay, {
      foreignKey: 'habitId',
      as: 'scheduleDays',
      onDelete: 'CASCADE',
    });
    Habit.hasMany(models.HabitCompletion, {
      foreignKey: 'habitId',
      as: 'completions',
      onDelete: 'CASCADE',
    });
    Habit.hasMany(models.HabitReminder, {
      foreignKey: 'habitId',
      as: 'reminders',
      onDelete: 'CASCADE',
    });
  }
}
