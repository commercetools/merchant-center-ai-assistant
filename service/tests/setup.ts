/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../src/utils/logger.utils';

// Keep test output readable: the default console transport is muted.
// Tests that assert on log lines add their own transport (helpers/log-capture).
logger.transports.forEach((t) => {
  t.silent = true;
});
