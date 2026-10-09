/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { McpProviderStatus } from '../../../hooks/admin-types';

/**
 * The tool menu groups are named after their source, which for the optional third-party
 * providers equals the provider name (`contentstack`, `algolia`, `stripe`). Returns the
 * missing key names when the service reports that provider as not configured, otherwise
 * `undefined` (configured, unknown source such as `commercetools`, or status not loaded).
 */
export const findUnconfiguredProvider = (
  providers: McpProviderStatus[],
  mcp: string
): { missingKeys: string[] } | undefined => {
  const status = providers.find((provider) => provider.provider === mcp);
  if (!status || status.configured) return undefined;
  return { missingKeys: status.missingKeys };
};
