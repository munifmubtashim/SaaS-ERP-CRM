// Frontend ESLint: the shared base rules plus React rules and the frontend's layer rule.
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig, NOT_SUPPORTED } from '../../eslint.config.mjs';

// Code standards (CLAUDE.md, ADR 0004): function components with hooks only; services are built in
// one place (services/index.ts) and reach components through useServices().
const CLASS_COMPONENT = {
  selector:
    'ClassDeclaration[superClass.name=/^(Component|PureComponent)$/], ClassDeclaration[superClass.property.name=/^(Component|PureComponent)$/]',
  message: 'Write function components with hooks; class components are not used.',
};
const NEW_SERVICE = {
  selector: 'NewExpression[callee.name=/(Service|HttpClient)$/]',
  message: 'Construct services only in services/index.ts (createServices); get them with useServices().',
};

export default tseslint.config(
  ...baseConfig,
  {
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
      'no-restricted-syntax': ['error', CLASS_COMPONENT, NEW_SERVICE, NOT_SUPPORTED],
    },
  },
  // The frontend composition root may construct services; tests may build fakes.
  {
    files: ['src/services/index.ts'],
    rules: { 'no-restricted-syntax': ['error', CLASS_COMPONENT, NOT_SUPPORTED] },
  },
  { files: ['**/*.test.{ts,tsx}', 'src/test/**'], rules: { 'no-restricted-syntax': 'off' } },
);
