/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Project keys are case-sensitive in commercetools: exact comparison. */
export const isConfiguredProject = (
  sessionProjectKey: string,
  configuredProjectKey: string
): boolean => sessionProjectKey === configuredProjectKey;
