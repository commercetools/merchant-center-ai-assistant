/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { bool, int, oneOf, str } from '../parse';
import { SectionParser } from '../types';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: LogLevel;
  logHttp: boolean;
  feedbackBodyLimit: string;
}

export const parseServer: SectionParser<ServerConfig> = (env, ctx) => {
  const errors: string[] = [];
  const port = int(env, 'PORT', 8080, { min: 1 }, errors);
  if (port > 65535) errors.push('PORT: must be an integer <= 65535');
  const value: ServerConfig = {
    nodeEnv: ctx.nodeEnv,
    port,
    logLevel: oneOf(env, 'LOG_LEVEL', LOG_LEVELS, 'info', errors),
    logHttp: bool(env, 'LOG_HTTP', false, errors),
    feedbackBodyLimit: str(env, 'FEEDBACK_BODY_LIMIT') ?? '25mb',
  };
  if (!/^\d+(\.\d+)?\s*(b|kb|mb|gb)?$/i.test(value.feedbackBodyLimit)) {
    errors.push('FEEDBACK_BODY_LIMIT: must be a size such as 25mb');
  }
  return { value, errors };
};
