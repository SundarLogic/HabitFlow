/**
 * Workspace model: a container for habits (table `workspaces`).
 *
 * Every user owns exactly one `personal` workspace, created at signup (the DB enforces "at most
 * one" with a partial unique index). All workspace-scoped queries filter by workspace id.
 */
import { DataTypes, Model } from 'sequelize';
import { WORKSPACE_TYPES } from './constants.js';

export class Workspace extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    Workspace.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [1, 100] } },
        ownerUserId: { type: DataTypes.UUID, allowNull: false },
        workspaceType: {
          type: DataTypes.STRING(16),
          allowNull: false,
          validate: { isIn: { args: [WORKSPACE_TYPES], msg: 'invalid workspaceType' } },
        },
      },
      { sequelize, modelName: 'Workspace', tableName: 'workspaces' },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    Workspace.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'owner' });
    Workspace.hasMany(models.WorkspaceMember, {
      foreignKey: 'workspaceId',
      as: 'memberships',
      onDelete: 'CASCADE',
    });
    Workspace.belongsToMany(models.User, {
      through: models.WorkspaceMember,
      foreignKey: 'workspaceId',
      otherKey: 'userId',
      as: 'members',
    });
    Workspace.hasOne(models.WorkspaceSubscription, {
      foreignKey: 'workspaceId',
      as: 'subscription',
      onDelete: 'CASCADE',
    });
    Workspace.hasMany(models.Habit, {
      foreignKey: 'workspaceId',
      as: 'habits',
      onDelete: 'CASCADE',
    });
  }
}
