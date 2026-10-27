/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Parses simple KEY=VALUE lines. No evaluation, no interpolation; surrounding quotes are stripped. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Merges file values under the real environment: an existing non-empty variable wins. */
export function mergeEnv(env, fileValues) {
  const merged = { ...env };
  for (const [key, value] of Object.entries(fileValues)) {
    if (merged[key] === undefined || merged[key] === '') merged[key] = value;
  }
  return merged;
}

/** `1h`, `30m`, `2d`, `45s` -> milliseconds; undefined when the text is not of that form. */
export function parseSince(text) {
  const m = /^(\d+)([smhd])$/.exec(text ?? '');
  if (!m) return undefined;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return Number(m[1]) * unit;
}

/** `YYYY-MM-DDTHH:mm:ss` in UTC, the format `deployment logs --startDate` documents. */
export function logDate(ms) {
  return new Date(ms).toISOString().slice(0, 19);
}
