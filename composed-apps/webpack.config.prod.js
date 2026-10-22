/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const {
  createWebpackConfigForProduction,
} = require('@commercetools-frontend/mc-scripts/webpack');

// Connect builds all applications at once. The defaults (source maps, one worker per CPU)
// need over 5 GB for one build; this needs about half.
const config = createWebpackConfigForProduction({
  toggleFlags: { parallelism: false },
});
config.devtool = false;

module.exports = config;
