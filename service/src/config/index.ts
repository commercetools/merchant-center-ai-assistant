/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Secret } from './secret';
import { SECTIONS, AppConfig } from './sections';
import { NodeEnv, ParseContext, SectionResult } from './types';

export type { AppConfig } from './sections';
export { Secret } from './secret';
export type { CtpConfig } from './sections/ctp';

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

let cached: Readonly<AppConfig> | undefined;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Secret) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

/**
 * The only place that reads environment variables. Validates every section,
 * reports all problems at once (`KEY: rule`, never a value) and returns a
 * deeply frozen object that is cached after the first success.
 */
export function readConfiguration(
  env: NodeJS.ProcessEnv = process.env
): Readonly<AppConfig> {
  if (cached) return cached;

  const errors: string[] = [];
  const rawNodeEnv = env.NODE_ENV?.trim() || 'production';
  let nodeEnv: NodeEnv = 'production';
  if ((NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
    nodeEnv = rawNodeEnv as NodeEnv;
  } else {
    errors.push('NODE_ENV: must be one of development, test, production');
  }
  const ctx: ParseContext = { nodeEnv };

  const values: Record<string, unknown> = {};
  for (const [name, parse] of Object.entries(SECTIONS)) {
    const result = (
      parse as (e: NodeJS.ProcessEnv, c: ParseContext) => SectionResult<unknown>
    )(env, ctx);
    errors.push(...result.errors);
    values[name] = result.value;
  }

  if (errors.length > 0) {
    throw new Error('Invalid environment configuration: ' + errors.join('; '));
  }

  cached = deepFreeze(values as AppConfig);
  return cached;
}

export function resetConfigurationForTests(): void {
  cached = undefined;
}
