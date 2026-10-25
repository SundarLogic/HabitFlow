/**
 * Migration: create the `plans` table (plan definitions and their entitlements).
 *
 * Limits live here as data, never hard-coded in services (CLAUDE.md §3.1), e.g.
 *   limits   = { "maxActiveHabits": 10, "historyDays": null }   (null = unlimited)
 *   features = { "purchasable": false }
 * Rows are inserted by the idempotent seeder src/seeders/*-plans.cjs.
 */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'plans',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
          },
          // Stable machine identifier ('free', 'pro'), referenced by code and seeders.
          code: { type: Sequelize.STRING(32), allowNull: false },
          name: { type: Sequelize.STRING(100), allowNull: false },
          limits: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: Sequelize.literal(`'{}'::jsonb`),
          },
          features: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: Sequelize.literal(`'{}'::jsonb`),
          },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE plans
           ADD CONSTRAINT plans_code_unique UNIQUE (code),
           -- A format rule rather than a fixed list, so a new plan is a seeder change, not a migration.
           ADD CONSTRAINT plans_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
           ADD CONSTRAINT plans_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
           ADD CONSTRAINT plans_limits_object CHECK (jsonb_typeof(limits) = 'object'),
           ADD CONSTRAINT plans_features_object CHECK (jsonb_typeof(features) = 'object')`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plans');
  },
};
