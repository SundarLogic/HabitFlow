/**
 * ESLint configuration for the frontend ("flat config"). Run with `npm run lint`.
 *
 * Mirrors backend/eslint.config.js, plus:
 *   - JSX parsing and browser globals;
 *   - eslint-plugin-react-hooks: the Rules of Hooks and exhaustive effect dependencies, which
 *     catch real bugs (stale values, hooks called conditionally).
 * Formatting is Prettier's job; eslint-config-prettier (last) turns off conflicting rules.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'public/mockServiceWorker.js'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  reactHooks.configs.flat['recommended-latest'],

  // Config files and tests run in Node / Vitest.
  {
    files: ['*.config.js', 'src/test/**', '**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },

  prettier,
];
