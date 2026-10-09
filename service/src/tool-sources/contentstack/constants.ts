/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export const CONTENTSTACK_SOURCE_NAME = 'contentstack';

export const CONTENTSTACK_UPDATE_TOOLS: readonly string[] = [
  'create_content_type',
  'update_content_type',
  'delete_content_type',
  'create_entry',
  'update_entry',
  'delete_entry',
  'publish_entry',
  'unpublish_entry',
  'create_global_field',
  'update_global_field',
];

export const CONTENTSTACK_READ_TOOLS: readonly string[] = [
  'get_content_type',
  'get_all_content_types',
  'get_entry',
  'get_entries',
  'get_all_global_fields',
];

export const CONTENTSTACK_TOOLS: readonly string[] = [
  ...CONTENTSTACK_UPDATE_TOOLS,
  ...CONTENTSTACK_READ_TOOLS,
];
