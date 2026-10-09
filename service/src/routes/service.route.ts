/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';

export const serviceRouter = Router();

serviceRouter.get('/status', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
