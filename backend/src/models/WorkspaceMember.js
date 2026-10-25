/**
 * WorkspaceMember model: "user U belongs to workspace W with role R" (table `workspace_members`).
 *
 * This is the join table behind User <-> Workspace, and the table the workspace middleware
 * checks to answer "may this user use the workspace in X-Workspace-Id?".
 * The row's creation time is stored as joined_at instead of created_at.
 */
import { DataTypes, Model } from 'sequelize';
import { MEMBER_ROLES } from './constants.js';

export class WorkspaceMember extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    WorkspaceMember.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        workspaceId: { type: DataTypes.UUID, allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        role: {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: 'member',
          validate: { isIn: { args: [MEMBER_ROLES], msg: 'invalid role' } },
        },
      },
      {
        sequelize,
        modelName: 'WorkspaceMember',
        tableName: 'workspace_members',
        // Rename the automatic createdAt timestamp; underscored maps joinedAt -> joined_at.
        createdAt: 'joinedAt',
      },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    WorkspaceMember.belongsTo(models.Workspace, { foreignKey: 'workspaceId', as: 'workspace' });
    WorkspaceMember.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}
