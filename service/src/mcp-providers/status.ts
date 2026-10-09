/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  ProvidersConfig,
  ProviderStatus,
} from '../config/provider-status';
import { PROVIDERS } from './types';

/**
 * Pure status of the three providers, in API order, with exactly four fields each (no
 * values, lengths, hosts or prefixes). Also used by the post-deploy report (change U).
 */
export const getProviderStatuses = (cfg: ProvidersConfig): ProviderStatus[] =>
  PROVIDERS.map((provider) => {
    const s = cfg.status.find((x) => x.provider === provider);
    return {
      provider,
      configured: s?.configured ?? false,
      enabled: s?.enabled ?? false,
      missingKeys: [...(s?.missingKeys ?? [])],
    };
  });
