/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createApplicationLogger } from '@commercetools-backend/loggers';
import { format } from 'winston';
import { readConfiguration } from '../config';
import { getContext } from '../context/request-context';

/**
 * The logger must never throw: index.ts needs it to report an invalid
 * configuration. While the configuration is unreadable the level is `info`.
 */
function logLevel(): string {
  try {
    return readConfiguration().server.logLevel;
  } catch {
    return 'info';
  }
}

const withCorrelation = format((info) => {
  const correlationId = getContext()?.correlationId;
  if (correlationId) info.correlationId = correlationId;
  return info;
});

export const logger = createApplicationLogger({
  level: logLevel(),
  json: true,
  formatters: [withCorrelation()],
});
