import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules', '.claude', '.mahler'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '19.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['src/growth.js', 'src/sync.js', 'worker/src/**/*.js'],
    rules: {
      // snapTooltip in src/growth.js has complexity 20; validateBody in worker/src/index.js has 18.
      complexity: ['error', 20],
    },
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['**/*.test.js', 'test/**/*.js', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
