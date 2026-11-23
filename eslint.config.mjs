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

// ---- Code-standard selectors (no-restricted-syntax) -------------------------
const ban = (selector, message) => ({ selector, message });
export const NEW_QUERY_MANAGER = ban(
  'NewExpression[callee.name=/(Query|Manager)$/]',
  'Construct Queries and Managers only in createManagers (businessLogic/src/index.ts); inject an interface instead.',
);
export const NEW_CONTROLLER = ban(
  'NewExpression[callee.name=/Controller$/]',
  'Construct Controllers only in createControllers (api/controllers/index.ts).',
);
export const NOT_SUPPORTED = ban(
  'ThrowStatement NewExpression > Literal[value=/not (supported|implemented)/i]',
  'Liskov: a subclass must work wherever its base does. Do not override a method to throw "not supported"; split the interface instead.',
);
export const PRISMA_REEXPORT = [
  ban(
    'ExportAllDeclaration[source.value=/generated/]',
    'No Prisma types leave dal: export DTO classes instead.',
  ),
  ban(
    'ExportNamedDeclaration[source.value=/generated/]',
    'No Prisma types leave dal: export DTO classes instead.',
  ),
];
export const HAND_WRITTEN_TYPE = [
  ban(
    'TSInterfaceDeclaration',
    'shared types are inferred from the Zod schemas: z.infer<typeof <module>Schema>.',
  ),
  ban(
    'TSTypeAliasDeclaration > TSTypeLiteral',
    'shared types are inferred from the Zod schemas: z.infer<typeof <module>Schema>.',
  ),
];
export const syntax = (...rules) => ({ 'no-restricted-syntax': ['error', ...rules] });

// Connections that bypass the tenant scope runner (ADR 0005), each reserved for named Queries.
const UNSCOPED_ONLY = {
  group: ['**/UnscopedQuery', '**/UnscopedQuery.js'],
  message:
    'ADR 0005: only AuthQuery and HealthQuery may extend UnscopedQuery. Tenant Queries extend BaseQuery.',
};
const PROVISIONER_ONLY = {
  group: ['**/provisionerDb', '**/provisionerDb.js'],
  message: 'ADR 0008: only ProvisioningQuery may use the erp_provisioner connection (config/provisionerDb).',
};

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

// ADR 0012: another module is reached only through its published interface (contracts/provided/*), never through
// its Manager, service or any other class, not even as a type. An allowlist (Farhan, #97): a relative import in
// businessLogic/src may reach only ./contracts/** and the JournalDraftRules helper (pure functions the fakes share).
// Every other relative import is refused, whatever the class is called. The ../ forms cover businessLogic/src/test/.
// Classes are wired together only in index.ts (createManagers), which is not covered.
const PROVIDED_INTERFACES_ONLY = {
  regex: String.raw`^\.\.?/(?!contracts/|JournalDraftRules(\.js)?$)`,
  message:
    "Depend on an interface in ./contracts/ (another module's in ./contracts/provided/), not on a class. Classes are wired in index.ts.",
};

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

  // ---- Code standards (CLAUDE.md "Code standards", ADR 0004) --------------
  // Later entries replace earlier no-restricted-syntax lists for the files they match, so each
  // composition root re-declares the full list minus the one `new` it is allowed to do.
  {
    files: ['packages/backend/src/**/*.ts'],
    rules: syntax(NEW_QUERY_MANAGER, NEW_CONTROLLER, NOT_SUPPORTED),
  },
  {
    files: ['packages/backend/src/businessLogic/src/index.ts'],
    rules: syntax(NEW_CONTROLLER, NOT_SUPPORTED),
  },
  {
    files: ['packages/backend/src/api/controllers/index.ts'],
    rules: syntax(NEW_QUERY_MANAGER, NOT_SUPPORTED),
  },
  {
    files: ['packages/backend/src/dal/index.ts'],
    rules: syntax(NEW_QUERY_MANAGER, NEW_CONTROLLER, NOT_SUPPORTED, ...PRISMA_REEXPORT),
  },
  {
    // ADR 0010 (Farhan's decision on #32): createProvisioningQuery() builds the provisioner client and the
    // Query together, so the client never leaves dal. The one Query constructed outside createManagers.
    files: ['packages/backend/src/dal/query/ProvisioningQuery.ts'],
    rules: syntax(NEW_CONTROLLER, NOT_SUPPORTED),
  },
  { files: ['packages/shared/src/types/**/*.ts'], rules: syntax(...HAND_WRITTEN_TYPE) },
  {
    // Controllers depend on api-owned contracts (I<Module>Manager), never on businessLogic classes.
    files: ['packages/backend/src/api/controllers/*Controller.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@erp/business-logic',
              message: 'Depend on ./contracts/I<Module>Manager (an interface), not on businessLogic.',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR 0012, widened after the #97 review: no businessLogic class reaches another module's Manager or service
    // class, only its published interface. The composition root and tests are exempt. Managers get the same patterns
    // in the next block, together with their @erp/dal rule (a later block replaces this one's options for them).
    files: ['packages/backend/src/businessLogic/src/**/*.ts'],
    // contracts/ holds interfaces only, which may name each other.
    ignores: [
      'packages/backend/src/businessLogic/src/index.ts',
      'packages/backend/src/businessLogic/src/contracts/**',
      '**/*.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [PROVIDED_INTERFACES_ONLY] }],
    },
  },
  {
    // Managers depend on businessLogic contracts (I<Module>Query); only DTO types may come from dal.
    files: ['packages/backend/src/businessLogic/src/*Manager.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@erp/dal',
              allowTypeImports: true,
              message: 'Depend on ./contracts/I<Module>Query; import only types (DTOs) from @erp/dal.',
            },
          ],
          // ADR 0012: another module is reached only through its published interface (contracts/provided/*),
          // never through its Manager or its service class, not even as a type.
          patterns: [PROVIDED_INTERFACES_ONLY],
        },
      ],
    },
  },
  // ADR 0005: only AuthQuery and HealthQuery run without a tenant scope; every other Query extends BaseQuery.
  // ADR 0008 (ADR 0005 named exception): only ProvisioningQuery may use the erp_provisioner connection.
  // One rule config per file set, because a later block replaces an earlier one's patterns for the same rule.
  {
    files: ['packages/backend/src/dal/**/*.ts'],
    ignores: [
      '**/dal/query/AuthQuery.ts',
      '**/dal/query/HealthQuery.ts',
      '**/dal/query/ProvisioningQuery.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [UNSCOPED_ONLY, PROVISIONER_ONLY] }],
    },
  },
  {
    files: ['**/dal/query/AuthQuery.ts', '**/dal/query/HealthQuery.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns: [PROVISIONER_ONLY] }] },
  },
  {
    files: ['**/dal/query/ProvisioningQuery.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns: [UNSCOPED_ONLY] }] },
  },
  { files: ['**/*.test.ts', '**/test/**'], rules: { 'no-restricted-syntax': 'off' } },
);
