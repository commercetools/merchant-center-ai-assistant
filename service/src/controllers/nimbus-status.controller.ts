/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler } from 'express';
import { getNimbusBackend } from '../nimbus';

/**
 * Readiness of the embedded Nimbus MCP: the child handshook and serves the 7 expected tools.
 * Unauthenticated like `/status`; reveals only the nimbus-mcp version and tool names, and is
 * cached for 30 s inside the backend. 200 for `ok` and `disabled`, 503 otherwise.
 * `/service/status` itself never calls this.
 */
export const nimbusStatus: RequestHandler = async (_req, res) => {
  const readiness = await getNimbusBackend().readiness();
  const healthy = readiness.status === 'ok' || readiness.status === 'disabled';
  res.status(healthy ? 200 : 503).json(readiness);
};
