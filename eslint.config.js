// Lints the library source. Run with: npm run lint
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'examples/**', 'tests/**', 'assets/**', 'demos/**'] },
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Empty catch blocks are used on purpose to swallow expected WAAPI errors (commitStyles, cancel)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // hasOwnProperty is only called on the library's own plain objects (defaults, params)
      'no-prototype-builtins': 'off',
    },
  },
];
