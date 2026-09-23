import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Use src/api/* helpers so learner data can never be attached to requests.',
        },
      ],
    },
  },
  {
    files: ['src/api/**/*.ts', 'src/admin/**/*.ts', 'src/admin/**/*.tsx', 'e2e/**/*.ts', 'src/**/*.test.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
