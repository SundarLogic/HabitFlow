/**
 * Migration: create the `habits` table.
 *
 * A habit belongs to a workspace and has one of three schedules (CLAUDE.md §3.1):
 *   daily          every day from start_date
 *   weekdays       only the ISO weekdays listed in habit_schedule_days
 *   weekly_target  target_per_week completions per ISO week, on any days
 * DELETE archives a habit (status 'archived' + archived_at) instead of removing it.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'habits',
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
          created_by: {
            type: Sequelize.UUID,
            allowNull: false,
            // RESTRICT: never silently drop habits when a user row goes away. Personal habits are
            // removed through their workspace's CASCADE instead.
            references: { model: 'users', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          name: { type: Sequelize.STRING(100), allowNull: false },
          description: { type: Sequelize.STRING(500), allowNull: true },
          category: { type: Sequelize.STRING(50), allowNull: true },
          color: { type: Sequelize.STRING(7), allowNull: true },
          icon: { type: Sequelize.STRING(50), allowNull: true },
          frequency_type: { type: Sequelize.STRING(16), allowNull: false },
          target_per_week: { type: Sequelize.SMALLINT, allowNull: true },
          start_date: { type: Sequelize.DATEONLY, allowNull: false },
          status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
          archived_at: { type: Sequelize.DATE, allowNull: true },
          sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE habits
           ADD CONSTRAINT habits_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
           ADD CONSTRAINT habits_description_length CHECK (char_length(description) <= 500),
           ADD CONSTRAINT habits_category_length CHECK (char_length(category) BETWEEN 1 AND 50),
           ADD CONSTRAINT habits_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
           ADD CONSTRAINT habits_icon_length CHECK (char_length(icon) BETWEEN 1 AND 50),
           ADD CONSTRAINT habits_frequency_type_valid
             CHECK (frequency_type IN ('daily', 'weekdays', 'weekly_target')),
           -- target_per_week is required (1-7) for weekly_target habits and forbidden otherwise.
           -- The explicit IS NOT NULL matters: "NULL BETWEEN 1 AND 7" is NULL, not false, and a
           -- CHECK whose result is NULL PASSES, so without it a weekly_target with no target
           -- would be accepted.
           ADD CONSTRAINT habits_target_per_week_matches_frequency CHECK (
             (frequency_type = 'weekly_target'
               AND target_per_week IS NOT NULL AND target_per_week BETWEEN 1 AND 7)
             OR (frequency_type <> 'weekly_target' AND target_per_week IS NULL)
           ),
           ADD CONSTRAINT habits_status_valid CHECK (status IN ('active', 'archived')),
           -- archived_at is set exactly when the habit is archived.
           ADD CONSTRAINT habits_archived_at_matches_status
             CHECK ((status = 'archived') = (archived_at IS NOT NULL))`,
        { transaction },
      );
      // Main access path: "active habits in workspace X". Also serves plain workspace_id lookups.
      await queryInterface.addIndex('habits', ['workspace_id', 'status'], {
        name: 'habits_workspace_id_status_idx',
        transaction,
      });
      await queryInterface.addIndex('habits', ['created_by'], {
        name: 'habits_created_by_idx',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('habits');
  },
};
