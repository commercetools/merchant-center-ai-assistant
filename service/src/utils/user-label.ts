/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const MAX_LABEL_CODE_POINTS = 120;

/**
 * A browser-supplied label (for example an e-mail address) that may only ever be shown as
 * unverified text. Never compare, key or filter by it.
 */
export function sanitizeUserLabel(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return undefined;
  // Spread iterates by code point, so a surrogate pair is never split.
  const limited = [...cleaned].slice(0, MAX_LABEL_CODE_POINTS).join('').trim();
  return limited === '' ? undefined : limited;
}
