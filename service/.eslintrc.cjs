/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['build/', 'node_modules/', 'scripts/'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'off',
    'no-console': 'error',
    'no-const-assign': 'error',
  },
  env: { es6: true, jest: true, node: true },
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'error' },
    },
    {
      files: ['src/**/*.ts'],
      // The lifecycle env module is the one other reader (design D-U9 of change U).
      excludedFiles: ['src/config/**/*.ts', 'src/connector/env.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'env',
            message:
              'Read configuration through readConfiguration() (src/config).',
          },
        ],
      },
    },
  ],
};
