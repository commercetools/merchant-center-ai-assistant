/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Heading, LoadingSpinner, Stack, Text } from '@commercetools/nimbus';
import { useMcpProviders } from '../../contexts/mcp-providers';
import { ConfigError } from '../configure-mcp/form-parts';
import { ProviderStatusCard } from '../configure-mcp/provider-status-card';

/**
 * MCP Providers: which optional third-party sources (Contentstack, Algolia, Stripe) the
 * deployment has configured.
 *
 * Read-only and identical for every member. Provider credentials are Connect deployment
 * configuration; there is nothing to type, no form and no Save here, and no credential
 * ever reaches the browser. The two always-on sources (commercetools and the
 * commercetools knowledge base) are not providers and have no card.
 *
 * The data is loaded when the settings drawer first opens (see `SettingsDrawer`).
 */
export const ConfigureMCPProviders: React.FC = () => {
  const { providers, loading, error } = useMcpProviders();

  return (
    <Stack direction="column" gap="400">
      <Heading as="h3" size="sm">
        MCP Providers
      </Heading>

      {loading && (
        <Stack direction="row" gap="200" alignItems="center">
          <LoadingSpinner size="sm" />
          <Text color="neutral.11">Loading connected sources…</Text>
        </Stack>
      )}

      {!loading && error && <ConfigError>{error}</ConfigError>}

      {!loading && !error && providers.length === 0 && (
        <Text color="neutral.11" fontSize="300">
          No optional sources are available.
        </Text>
      )}

      {!loading &&
        !error &&
        providers.map((status) => (
          <ProviderStatusCard key={status.provider} status={status} />
        ))}
    </Stack>
  );
};

export default ConfigureMCPProviders;
