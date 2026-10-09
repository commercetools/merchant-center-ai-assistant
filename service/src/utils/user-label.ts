/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * TODO(unify with change G): change G owns this helper (`sanitizeUserLabel`). This file exists
 * only so change N compiles on its own; when both branches are merged, keep G's version.
 *
 * Display text supplied by the browser. Unverified: never used for authorisation, keys,
 * filters, ownership or joins.
 */
export const MAX_USER_LABEL_LENGTH = 120;

export const sanitizeUserLabel = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_USER_LABEL_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
};
