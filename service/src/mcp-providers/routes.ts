/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/api-response';
import { listProviders } from './controller';

/**
 * Mounted at /service/mcp behind `verifyMcSession` only (any verified member; no
 * `requireAdmin`: the response discloses no secret). It is the only route here: provider
 * configuration is Connect deployment configuration, there is no write API.
 */
export const mcpProvidersRouter = Router();

mcpProvidersRouter.get('/providers', asyncHandler(listProviders));
