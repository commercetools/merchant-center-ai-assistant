/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const MAX_ENTRIES = 50;
const ENTRY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Parses the ADMIN_USER_IDS allowlist (Merchant Center user ids).
 * Unset or blank means nobody is an administrator. Entry text is never echoed.
 */
export function parseAdminUserIds(raw: string | undefined): {
  value: readonly string[];
  errors: string[];
} {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return { value: Object.freeze([]), errors: [] };

  const entries = trimmed.split(/[,;\s]+/).filter((e) => e !== '');
  const errors: string[] = [];

  if (entries.length > MAX_ENTRIES) {
    errors.push('ADMIN_USER_IDS: at most 50 entries');
  } else {
    entries.forEach((entry, i) => {
      if (!ENTRY_PATTERN.test(entry)) {
        errors.push(`ADMIN_USER_IDS: entry ${i + 1} is not a valid user id`);
      }
    });
  }

  return { value: Object.freeze([...new Set(entries)]), errors };
}
