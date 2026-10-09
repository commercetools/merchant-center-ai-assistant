/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const MAX_ENTRIES = 50;
// Merchant Center user ids are UUID-like. Stricter than "no whitespace or
// control characters": an e-mail address pasted by mistake must fail loudly.
const ENTRY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ParsedAdminUserIds {
  value: ReadonlySet<string>;
  /** `ADMIN_USER_IDS: ...` messages; never contain an entry. */
  errors: string[];
}

/**
 * Parses the ADMIN_USER_IDS allowlist (Merchant Center user ids): split on `,`
 * or `;`, trim, drop empty entries, de-duplicate, keep case.
 * Unset or blank means nobody is an administrator.
 */
export function parseAdminUserIds(raw: string | undefined): ParsedAdminUserIds {
  const entries = (raw ?? '')
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter((e) => e !== '');
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
  return { value: new Set(entries), errors };
}

/**
 * The one place the allowlist is compared. Takes only the verified gateway
 * `sub`: exact, case-sensitive, no wildcard, no substring match.
 */
export function isAdminUser(
  userId: string,
  adminUserIds: ReadonlySet<string>
): boolean {
  return adminUserIds.has(userId);
}
