/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { TComposedPage, TPageSchemaV5 } from '../../types/composed-page';

export type TCustomObjectValue = {
  name?: string;
  icon?: string;
  schema?: unknown;
  isPublished?: boolean;
  createdBy?: string;
};

export type TCustomObjectResult = {
  id: string;
  key: string;
  container: string;
  // The Merchant Center proxy returns the value already parsed; a string is tolerated.
  value: string | TCustomObjectValue;
  version: number;
  createdAt: string;
  lastModifiedAt: string;
};

/**
 * Turns a Custom Object into a composed page. An unreadable value yields a minimal page
 * with schema version "unknown", which the renderer shows as "Legacy Page Format".
 */
export function parseComposedPage(
  customObject: TCustomObjectResult
): TComposedPage {
  try {
    const value: TCustomObjectValue =
      typeof customObject.value === 'string'
        ? (JSON.parse(customObject.value) as TCustomObjectValue)
        : customObject.value;

    return {
      id: customObject.id,
      key: customObject.key,
      name: value.name || customObject.key,
      icon: value.icon,
      schema: value.schema as TPageSchemaV5,
      isPublished: value.isPublished ?? true,
      createdAt: customObject.createdAt,
      updatedAt: customObject.lastModifiedAt,
      createdBy: value.createdBy,
    };
  } catch {
    return {
      id: customObject.id,
      key: customObject.key,
      name: customObject.key,
      schema: { version: 'unknown' } as TComposedPage['schema'],
      isPublished: false,
      createdAt: customObject.createdAt,
      updatedAt: customObject.lastModifiedAt,
    };
  }
}
