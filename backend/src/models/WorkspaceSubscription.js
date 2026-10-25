/**
 * WorkspaceSubscription model: which plan a workspace is on (table `workspace_subscriptions`).
 *
 * At most one row per workspace. No row (or no active row) means the workspace uses the
 * `free` plan. The provider* fields are reserved for a future billing integration.
 */
import { DataTypes, Model } from 'sequelize';
import { SUBSCRIPTION_STATUSES } from './constants.js';

export class WorkspaceSubscription extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    WorkspaceSubscription.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        workspaceId: { type: DataTypes.UUID, allowNull: false },
        planId: { type: DataTypes.UUID, allowNull: false },
        status: {
          type: DataTypes.STRING(16),
          allowNull: false,
          validate: { isIn: { args: [SUBSCRIPTION_STATUSES], msg: 'invalid status' } },
        },
        currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
        provider: { type: DataTypes.STRING(32), allowNull: true },
        providerCustomerId: { type: DataTypes.STRING(255), allowNull: true },
        providerSubscriptionId: { type: DataTypes.STRING(255), allowNull: true },
      },
      { sequelize, modelName: 'WorkspaceSubscription', tableName: 'workspace_subscriptions' },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    WorkspaceSubscription.belongsTo(models.Workspace, {
      foreignKey: 'workspaceId',
      as: 'workspace',
    });
    WorkspaceSubscription.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
  }
}
