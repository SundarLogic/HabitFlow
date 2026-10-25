/**
 * Session model: one logged-in device/browser (table `sessions`, CLAUDE.md §3.1).
 *
 * Only the SHA-256 hash of the session token is stored (tokenHash); the raw token exists
 * only in the user's cookie. There is no updatedAt column: lastUsedAt tracks activity.
 */
import { DataTypes, Model } from 'sequelize';

export class Session extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    Session.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        userId: { type: DataTypes.UUID, allowNull: false },
        tokenHash: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          validate: { is: { args: /^[0-9a-f]{64}$/, msg: 'tokenHash must be a hex SHA-256' } },
        },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        ip: { type: DataTypes.INET, allowNull: true },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        lastUsedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      { sequelize, modelName: 'Session', tableName: 'sessions', updatedAt: false },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    Session.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}
