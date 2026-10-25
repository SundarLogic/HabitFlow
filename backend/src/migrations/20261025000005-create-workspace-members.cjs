/**
 * Migration: create the `workspace_members` table (which users belong to which workspace, and
 * with what role). Workspace authorization checks membership here on every request.
 *
 * joined_at plays the role of created_at; updated_at records role changes.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'workspace_members',
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
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          role: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'member' },
          joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE workspace_members
           -- One membership per user per workspace. Its index also serves "members of workspace X".
           ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id),
           ADD CONSTRAINT workspace_members_role_valid CHECK (role IN ('owner', 'admin', 'member'))`,
        { transaction },
      );
      // "Which workspaces can this user access?" (GET /workspaces, X-Workspace-Id checks).
      await queryInterface.addIndex('workspace_members', ['user_id'], {
        name: 'workspace_members_user_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workspace_members');
  },
};
