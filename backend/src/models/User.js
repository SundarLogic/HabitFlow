/**
 * User model: a registered account (table `users`).
 *
 * Services use it for signup, login and account settings. Security rules built in here:
 *   - The default scope EXCLUDES passwordHash, so a normal `User.findByPk(id)` never loads it.
 *     Only login code should use `User.scope('withPassword')`.
 *   - toJSON() also drops passwordHash, as a second guard in case an instance that has it
 *     (e.g. the one returned by User.create) is ever sent in a response or logged.
 *   - Emails are trimmed and lowercased on assignment (the DB rejects uppercase emails).
 */
import { DataTypes, Model } from 'sequelize';
import { IANAZone } from 'luxon';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './constants.js';

export class User extends Model {
  /**
   * Defines the columns, validation and scopes. Called once by models/index.js.
   * @param {import('sequelize').Sequelize} sequelize the shared connection
   */
  static initModel(sequelize) {
    User.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          validate: { len: { args: [1, 100], msg: 'name must be 1-100 characters' } },
        },
        email: {
          type: DataTypes.STRING(254),
          allowNull: false,
          // A setter runs on every assignment (create, update, user.email = ...).
          set(value) {
            this.setDataValue(
              'email',
              typeof value === 'string' ? value.trim().toLowerCase() : value,
            );
          },
          validate: { isEmail: { msg: 'email must be a valid email address' } },
        },
        passwordHash: { type: DataTypes.STRING(255), allowNull: false },
        timezone: {
          type: DataTypes.STRING(64),
          allowNull: false,
          defaultValue: 'UTC',
          validate: {
            // Postgres can't check IANA names, so this is the real guard (CLAUDE.md §3.1).
            isIanaZone(value) {
              if (!IANAZone.isValidZone(value))
                throw new Error('timezone must be a valid IANA zone');
            },
          },
        },
        notificationPreferences: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: DEFAULT_NOTIFICATION_PREFERENCES,
          validate: {
            isPlainObject(value) {
              if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('notificationPreferences must be an object');
              }
            },
          },
        },
        lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      },
      {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        defaultScope: { attributes: { exclude: ['passwordHash'] } },
        scopes: {
          // `include` adds passwordHash on top of all columns. Using a named scope replaces the
          // default scope, so the exclusion above no longer applies.
          withPassword: { attributes: { include: ['passwordHash'] } },
        },
      },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    User.hasMany(models.Session, { foreignKey: 'userId', as: 'sessions', onDelete: 'CASCADE' });
    User.hasMany(models.Workspace, { foreignKey: 'ownerUserId', as: 'ownedWorkspaces' });
    User.hasMany(models.WorkspaceMember, {
      foreignKey: 'userId',
      as: 'memberships',
      onDelete: 'CASCADE',
    });
    User.belongsToMany(models.Workspace, {
      through: models.WorkspaceMember,
      foreignKey: 'userId',
      otherKey: 'workspaceId',
      as: 'workspaces',
    });
    User.hasMany(models.Habit, { foreignKey: 'createdBy', as: 'createdHabits' });
    User.hasMany(models.HabitCompletion, { foreignKey: 'completedBy', as: 'completions' });
    User.hasMany(models.HabitReminder, {
      foreignKey: 'userId',
      as: 'reminders',
      onDelete: 'CASCADE',
    });
    User.hasMany(models.Notification, {
      foreignKey: 'userId',
      as: 'notifications',
      onDelete: 'CASCADE',
    });
  }

  /** Plain-object form used by res.json() and loggers. Never includes the password hash. */
  toJSON() {
    const values = super.toJSON();
    delete values.passwordHash;
    return values;
  }
}
