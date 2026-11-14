// Shared ESLint flat config for the backend layers and shared. The frontend has its own
// eslint.config.js that extends this file and adds React rules.
//
// The layer rules below are the enforcement of CLAUDE.md "Layer rules":
//   api -> businessLogic -> dal, shared imports nothing. A wrong import fails `npm run lint`.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const layer = (message, packages, patterns = []) => ({
  'no-restricted-imports': [
    'error',
    {
      paths: packages.map((name) => ({ name, message })),
      patterns: [{ group: [...packages.map((p) => `${p}/*`), ...patterns], message }],
    },
  ],
});

export const baseConfig = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/generated/**',
      'design/**',
      'docs/**',
      '.adlc/**',
      '.agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Appendix C: "no any without a comment". Use an eslint-disable comment that says why.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/test/**',
      '**/scripts/**',
      '**/*.config.{ts,mjs,js}',
      '.claude/hooks/**',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
);

export default tseslint.config(
  ...baseConfig,

  // ---- Layer rules (one direction only) -----------------------------------
  {
    files: ['packages/shared/**/*.ts'],
    rules: layer('shared imports nothing from the other packages.', [
      '@erp/api',
      '@erp/business-logic',
      '@erp/dal',
      '@erp/frontend',
      'express',
      'react',
      '@prisma/client',
      'pg',
    ]),
  },
  {
    files: ['packages/backend/src/dal/**/*.ts'],
    rules: layer(
      'dal is the bottom layer: it may not import businessLogic, api, frontend or Express.',
      ['@erp/api', '@erp/business-logic', '@erp/frontend', 'express'],
      ['**/businessLogic/**', '**/api/**'],
    ),
  },
  {
    files: ['packages/backend/src/businessLogic/**/*.ts'],
    rules: layer(
      'businessLogic holds rules only: no Express, no SQL or Prisma (call a dal Query), no upward imports.',
      ['@erp/api', '@erp/frontend', 'express', 'pg', '@prisma/client', '@prisma/adapter-pg'],
      ['**/api/**', '**/dal/query/**', '**/dal/config/**', '**/generated/**'],
    ),
  },
  {
    files: ['packages/backend/src/api/**/*.ts'],
    rules: layer(
      'api is the HTTP layer: it calls Managers from @erp/business-logic, never dal, SQL or Prisma directly.',
      ['@erp/dal', '@erp/frontend', 'pg', '@prisma/client', '@prisma/adapter-pg'],
      ['**/dal/**', '**/businessLogic/src/**'],
    ),
  },
);
