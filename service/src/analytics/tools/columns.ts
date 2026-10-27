/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** `name TYPE, ...` of a table's fields; `undefined` when there are none. */
export const renderFieldColumns = (
  fields: { name?: string; type?: string }[] | undefined
): string | undefined => {
  if (!fields?.length) return undefined;
  return fields.map((field) => `${field.name} ${field.type}`).join(', ');
};
