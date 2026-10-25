/**
 * Plan model: a plan definition and its entitlements (table `plans`).
 *
 * Services read limits from here instead of hard-coding them (CLAUDE.md §3.1), e.g.
 *   plan.limits.maxActiveHabits   -> 10, or null for unlimited
 * Rows come from the plans seeder; the app never creates plans at runtime.
 */
import { DataTypes, Model } from 'sequelize';

/** Shared validator for the two JSONB columns, mirroring the DB's jsonb_typeof = 'object' check. */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('must be an object');
  }
}

export class Plan extends Model {
  /** @param {import('sequelize').Sequelize} sequelize the shared connection */
  static initModel(sequelize) {
    Plan.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        code: {
          type: DataTypes.STRING(32),
          allowNull: false,
          validate: { is: { args: /^[a-z][a-z0-9_]*$/, msg: 'code must be lower_snake_case' } },
        },
        name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [1, 100] } },
        limits: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          validate: { isPlainObject },
        },
        features: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          validate: { isPlainObject },
        },
        isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      },
      { sequelize, modelName: 'Plan', tableName: 'plans' },
    );
  }

  /** @param {Record<string, typeof Model>} models every model, keyed by name */
  static associate(models) {
    Plan.hasMany(models.WorkspaceSubscription, { foreignKey: 'planId', as: 'subscriptions' });
  }
}
