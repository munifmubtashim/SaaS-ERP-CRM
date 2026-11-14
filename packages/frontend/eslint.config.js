// Frontend ESLint: the shared base rules plus React rules and the frontend's layer rule.
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from '../../eslint.config.mjs';

export default tseslint.config(...baseConfig, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: { globals: { ...globals.browser } },
  plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // The frontend talks to the backend over HTTP only; it may import @erp/shared, nothing else.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@erp/api',
              '@erp/api/*',
              '@erp/business-logic',
              '@erp/business-logic/*',
              '@erp/dal',
              '@erp/dal/*',
              '**/backend/**',
            ],
            message: 'The frontend may import @erp/shared only; reach the backend through src/services.',
          },
        ],
      },
    ],
  },
});
