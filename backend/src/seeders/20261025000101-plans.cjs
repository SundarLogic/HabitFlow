/**
 * Seeder: the plan catalogue (`plans` table). Runs in every environment, including production.
 *
 *   free  max 10 active habits, full history
 *   pro   unlimited (null = no limit); active so existing rows can reference it, but not yet
 *         purchasable because billing is out of first-release scope
 *
 * Seeders are not recorded by sequelize-cli and may run many times, so this one UPSERTs on the
 * unique `code`: re-running it updates names/limits in place and keeps each plan's id stable
 * (workspace_subscriptions reference it).
 */
'use strict';

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    limits: { maxActiveHabits: 10, historyDays: null },
    features: { purchasable: false },
  },
  {
    code: 'pro',
    name: 'Pro',
    limits: { maxActiveHabits: null, historyDays: null },
    features: { purchasable: false },
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (const plan of PLANS) {
      // Named replacements (:code) are escaped by Sequelize, so values can't inject SQL.
      await queryInterface.sequelize.query(
        `INSERT INTO plans (code, name, limits, features, is_active)
         VALUES (:code, :name, CAST(:limits AS jsonb), CAST(:features AS jsonb), true)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           limits = EXCLUDED.limits,
           features = EXCLUDED.features,
           is_active = EXCLUDED.is_active,
           updated_at = now()`,
        {
          replacements: {
            code: plan.code,
            name: plan.name,
            limits: JSON.stringify(plan.limits),
            features: JSON.stringify(plan.features),
          },
        },
      );
    }
  },

  async down(queryInterface) {
    // Fails with a FK error if a workspace is still subscribed to a plan, which is intended.
    await queryInterface.bulkDelete('plans', { code: PLANS.map((plan) => plan.code) });
  },
};
