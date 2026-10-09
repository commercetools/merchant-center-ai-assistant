/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const base = require('./jest.config.cjs');

/**
 * Live tests against a scratch commercetools project. Credentials come from `.env.local`
 * (git-ignored) or the environment; every suite is skipped when CTP_CLIENT_SECRET is absent.
 */
module.exports = {
  ...base,
  displayName: 'Service integration',
  testMatch: ['**/tests/integration/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 60000,
  setupFiles: ['<rootDir>/tests/integration/load-env.cjs'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
