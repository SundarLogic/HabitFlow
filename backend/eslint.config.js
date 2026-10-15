/**
 * ESLint configuration ("flat config" format). Run with `npm run lint`.
 *
 * ESLint finds likely bugs and enforces team rules. Prettier (see .prettierrc.json) handles
 * formatting; `eslint-config-prettier` at the end switches off ESLint rules that would
 * fight with Prettier over formatting.
 *
 * The config is an array; later entries add to or override earlier ones, and `files`
 * limits an entry to matching files.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Folders ESLint should never check.
  { ignores: ['node_modules/', 'coverage/', 'dist/', 'logs/'] },

  // ESLint's recommended rule set (catches undefined variables, unreachable code, etc.).
  js.configs.recommended,

  // Our source files: modern JavaScript, ES modules, running in Node.js.
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }, // allow Node globals like process, Buffer, __dirname (CJS)
    },
    rules: {
      // Use the pino logger instead of console.log (logs must be structured and redacted).
      'no-console': 'error',
      // Always === / !== (== does surprising type conversions, e.g. 0 == '' is true).
      eqeqeq: ['error', 'always'],
      // Use const unless the variable is reassigned; never var.
      'prefer-const': 'error',
      'no-var': 'error',
      // An async function with no await is usually a mistake (forgot to await something).
      'require-await': 'error',
      // Unused variables are errors, except arguments named _something, req, res or next
      // (Express handlers must keep their parameter positions even when unused).
      'no-unused-vars': ['error', { argsIgnorePattern: '^(_|req$|res$|next$)' }],
    },
  },

  // .cjs files are CommonJS (require/module.exports), e.g. database.cjs, migrations.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Test files may use Jest globals: describe, it, expect, beforeEach, afterAll...
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  // Must be last: disables formatting rules that conflict with Prettier.
  prettier,
];
