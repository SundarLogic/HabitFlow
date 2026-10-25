/**
 * Migration: create the `workspaces` table.
 *
 * Every user gets one `personal` workspace at signup; `team` workspaces are prepared in the
 * schema but their features come later. Habits belong to a workspace, not directly to a user.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'workspaces',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          name: { type: Sequelize.STRING(100), allowNull: false },
          owner_user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            // RESTRICT: a user who still owns a workspace can't be deleted by accident. Future
            // account deletion must delete the personal workspace (cascading its data) first.
            references: { model: 'users', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          workspace_type: { type: Sequelize.STRING(16), allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE workspaces
           ADD CONSTRAINT workspaces_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
           ADD CONSTRAINT workspaces_workspace_type_valid
             CHECK (workspace_type IN ('personal', 'team'))`,
        { transaction },
      );
      // Partial unique index: at most ONE personal workspace per owner (team ones are unlimited).
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX workspaces_one_personal_per_owner
           ON workspaces (owner_user_id) WHERE workspace_type = 'personal'`,
        { transaction },
      );
      // Covers FK lookups for all workspace types (the partial index only covers personal).
      await queryInterface.addIndex('workspaces', ['owner_user_id'], {
        name: 'workspaces_owner_user_id_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workspaces');
  },
};
