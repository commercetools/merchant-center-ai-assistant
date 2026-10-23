/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Small parsing helpers shared by the section parsers. No value is ever echoed. */

/** Trimmed value, or undefined when unset or blank. */
export function str(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function int(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  opts: { min: number },
  errors: string[]
): number {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(n) || n < opts.min) {
    errors.push(`${key}: must be an integer >= ${opts.min}`);
    return fallback;
  }
  return n;
}

export function bool(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
  errors: string[]
): boolean {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push(`${key}: must be "true" or "false"`);
  return fallback;
}

export function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  key: string,
  allowed: readonly T[],
  fallback: T,
  errors: string[]
): T {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  errors.push(`${key}: must be one of ${allowed.join(', ')}`);
  return fallback;
}
