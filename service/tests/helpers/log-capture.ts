/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Writable } from 'node:stream';
import { transports } from 'winston';
import { logger } from '../../src/utils/logger.utils';

/** Collects the lines the service logger writes until `stop()` is called. */
export function captureLogs(): { lines: string[]; stop: () => void } {
  const lines: string[] = [];
  const transport = new transports.Stream({
    stream: new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    }),
  });
  logger.add(transport);
  return { lines, stop: () => void logger.remove(transport) };
}
