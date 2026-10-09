/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import { serviceRouter } from './routes/service.route';

const app = express();
app.use(express.json());
// MUST equal the `endpoint` of the service entry in connect.yaml.
app.use('/service', serviceRouter);

export default app;
