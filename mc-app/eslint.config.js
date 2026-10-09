/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

process.env.ENABLE_NEW_JSX_TRANSFORM = 'true';

const mcAppConfig = require('@commercetools-frontend/eslint-config-mc-app');

module.exports = [
  {
    ignores: [
      'src/utils/nimbus-surface.generated.ts',
      'public/',
      'dist/',
      'build/',
      'node_modules/',
    ],
  },
  ...mcAppConfig,
];
