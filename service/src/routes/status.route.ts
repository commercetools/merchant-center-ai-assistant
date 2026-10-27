/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { nimbusStatus } from '../controllers/nimbus-status.controller';
import { status } from '../controllers/status.controller';

export const statusRouter = Router();

statusRouter.get('/status', status);
// Readiness of the embedded Nimbus MCP (never part of /status, which must stay cheap).
statusRouter.get('/status/nimbus', nimbusStatus);
statusRouter.get('/health', status);
