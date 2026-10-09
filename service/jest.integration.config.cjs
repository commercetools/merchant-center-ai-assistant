/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Live (network) tests. Each suite skips itself when its credentials are absent.
const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  displayName: 'Service integration',
  testMatch: ['**/tests/integration/**/*.spec.ts'],
  testPathIgnorePatterns: [],
  testTimeout: 60000,
};
