/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { setMcpClientFactoryForTests } from '../src/tool-sources/mcp-tools';
import { logger } from '../src/utils/logger.utils';
import { offlineMcpFactory } from './helpers/mcp';

// Keep test output readable: the default console transport is muted.
// Tests that assert on log lines add their own transport (helpers/log-capture).
logger.transports.forEach((t) => {
  t.silent = true;
});

// No test may reach a real MCP server (the Knowledge source is always enabled).
setMcpClientFactoryForTests(offlineMcpFactory);
