/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { bootstrapSession } from '../controllers/mc-auth.controller';
import { verifyMcSession } from '../middleware/mc-session.middleware';

export const mcAuthRouter = Router();

mcAuthRouter.post('/session', verifyMcSession, bootstrapSession);
