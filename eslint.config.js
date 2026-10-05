import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'dist-test/', 'shots/', 'legacy/', 'prototype/', 'ios/', 'android/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { languageOptions: { globals: globals.browser } },
  { files: ['scripts/**'], languageOptions: { globals: globals.node } },
  {
    // core/ must stay pure: no DOM, no Three.js
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['three', 'three/*', '../render/*', '../ui/*', '../fx/*'] },
      ],
    },
  },
  prettier,
);
