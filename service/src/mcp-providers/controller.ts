/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request, Response } from 'express';
import { readConfiguration } from '../config';
import { ok } from '../utils/api-response';
import { getProviderStatuses } from './status';

/** `GET /service/mcp/providers`: read-only, names and booleans only. */
export const listProviders = async (_req: Request, res: Response) => {
  ok(res, getProviderStatuses(readConfiguration().providers));
};
