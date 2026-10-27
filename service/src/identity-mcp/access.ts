/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';

/** May this verified user write the shared Managed MCP binding? Administrators, or anyone under the flag. */
export const canManageBinding = (
  isAdmin: boolean,
  config: Pick<AppConfig, 'auth'>
): boolean => isAdmin || config.auth.mcpBindingOpenToAll;
