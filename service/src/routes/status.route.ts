/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { status } from '../controllers/status.controller';

export const statusRouter = Router();

statusRouter.get('/status', status);
statusRouter.get('/health', status);
