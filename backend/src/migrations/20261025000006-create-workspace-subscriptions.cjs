/**
 * Migration: create the `workspace_subscriptions` table (which plan a workspace is on).
 *
 * A workspace WITHOUT an active row here uses the `free` plan (CLAUDE.md §3.1), so new
 * workspaces need no row at all. The provider_* columns are placeholders for a future billing
 * integration (out of first-release scope) and stay NULL for now.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'workspace_subscriptions',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          workspace_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'workspaces', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          plan_id: {
            type: Sequelize.UUID,
            allowNull: false,
            // RESTRICT: a plan that workspaces are subscribed to can't be deleted.
            references: { model: 'plans', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          status: { type: Sequelize.STRING(16), allowNull: false },
          current_period_end: { type: Sequelize.DATE, allowNull: true },
          provider: { type: Sequelize.STRING(32), allowNull: true },
          provider_customer_id: { type: Sequelize.STRING(255), allowNull: true },
          provider_subscription_id: { type: Sequelize.STRING(255), allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE workspace_subscriptions
           -- One subscription row per workspace (also indexes workspace_id).
           ADD CONSTRAINT workspace_subscriptions_workspace_unique UNIQUE (workspace_id),
           ADD CONSTRAINT workspace_subscriptions_status_valid
             CHECK (status IN ('active', 'trialing', 'past_due', 'canceled'))`,
        { transaction },
      );
      await queryInterface.addIndex('workspace_subscriptions', ['plan_id'], {
        name: 'workspace_subscriptions_plan_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workspace_subscriptions');
  },
};
