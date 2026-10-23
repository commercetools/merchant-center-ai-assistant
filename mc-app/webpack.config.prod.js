/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const {
  createWebpackConfigForProduction,
} = require('@commercetools-frontend/mc-scripts/webpack');

// The source files use the automatic JSX runtime and do not import React. mc-scripts only
// picks that runtime when this variable is set, and Connect builds without a .env file.
process.env.ENABLE_NEW_JSX_TRANSFORM = 'true';

// Connect builds all applications at once. The defaults (source maps, one worker per CPU)
// need over 5 GB for one build; this needs about half.
const config = createWebpackConfigForProduction({
  toggleFlags: { parallelism: false },
});
config.devtool = false;

module.exports = config;
