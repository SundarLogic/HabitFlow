/**
 * Settings for sequelize-cli, the command-line tool that runs database migrations and seeders.
 * It tells the CLI where our DB config, models, migrations and seeders live.
 *
 * Why the unusual name (.sequelizerc.cjs instead of the default .sequelizerc)?
 *   Our package.json has "type": "module" (ES modules). Newer Node versions then treat a file
 *   without an extension as an ES module, but sequelize-cli loads this file with require(),
 *   which only works for CommonJS. The .cjs extension forces CommonJS on every Node version.
 *   Because of the custom name, always run the CLI through npm, which adds
 *   `--options-path .sequelizerc.cjs` for you:
 *     npm run db:migrate
 *     npm run sequelize -- migration:generate --name create-users
 *
 * Migrations and seeders must ALSO end in .cjs (the CLI loads them with require() too).
 * migration:generate creates a .js file, so rename it to .cjs.
 */
const path = require('node:path');

// Tells src/config/database.cjs that the CLI (not the app) is connecting, so migrations can use
// DATABASE_DIRECT_URL when it is set (Neon: direct connection for DDL, pooled one for the app).
process.env.HABITFLOW_DB_CLIENT = 'cli';

module.exports = {
  config: path.resolve(__dirname, 'src/config/database.cjs'),
  'models-path': path.resolve(__dirname, 'src/models'),
  'migrations-path': path.resolve(__dirname, 'src/migrations'),
  'seeders-path': path.resolve(__dirname, 'src/seeders'),
};
