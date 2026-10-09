/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { evaluateProvider } from '../../mcp-providers/schemas';
import { PROVIDERS } from '../../mcp-providers/types';
import type { ProviderEnv } from '../env';

/**
 * One line per provider, from the service's own enablement rule (required keys set AND
 * valid, `evaluateProvider`). Names of provider and keys only: never a value, a length, a
 * host or a prefix. Informational: never fails the deployment.
 */
export function reportProviders(providerEnv: ProviderEnv): { ok: true; lines: string[] } {
  const lines = PROVIDERS.map((provider) => {
    const { status } = evaluateProvider(provider, providerEnv);
    if (status.enabled) return `post-deploy: providers ${provider}: configured`;
    const reason = status.configured ? 'invalid' : 'missing';
    return `post-deploy: providers ${provider}: not configured (${reason}: ${status.missingKeys.join(', ')})`;
  });
  return { ok: true, lines };
}
