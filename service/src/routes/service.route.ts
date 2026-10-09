/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { backofficeRouter } from './backoffice.route';
import { feedbackRouter } from './feedback.route';
import { mcAuthRouter } from './mc-auth.route';
import { statusRouter } from './status.route';

/** Mounted at /service in app.ts; MUST equal `endpoint` in connect.yaml. */
export const serviceRouter = Router();

serviceRouter.use('/', statusRouter);
serviceRouter.use('/auth', mcAuthRouter);
serviceRouter.use('/feedback', feedbackRouter);
serviceRouter.use('/backoffice', backofficeRouter);
// Other changes mount their routers here.
