/**
 * Notification model: an in-app notification for one user (table `notifications`).
 *
 * dedupeKey makes generation idempotent: the cron job builds a key such as
 * 'reminder:<reminderId>:<date>' and the UNIQUE constraint rejects a second copy.
 * Rows never change except readAt, so there is no updatedAt.
 */
import { DataTypes, Model } from 'sequelize';
import { NOTIFICATION_TYPES } from './constants.js';

export class Notification extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    Notification.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        userId: { type: DataTypes.UUID, allowNull: false },
        type: {
          type: DataTypes.STRING(32),
          allowNull: false,
          validate: { isIn: { args: [NOTIFICATION_TYPES], msg: 'invalid notification type' } },
        },
        title: { type: DataTypes.STRING(120), allowNull: false, validate: { len: [1, 120] } },
        message: { type: DataTypes.STRING(500), allowNull: false, validate: { len: [1, 500] } },
        data: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          validate: {
            isPlainObject(value) {
              if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('data must be an object');
              }
            },
          },
        },
        dedupeKey: { type: DataTypes.STRING(200), allowNull: true, validate: { len: [1, 200] } },
        readAt: { type: DataTypes.DATE, allowNull: true },
      },
      { sequelize, modelName: 'Notification', tableName: 'notifications', updatedAt: false },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}
