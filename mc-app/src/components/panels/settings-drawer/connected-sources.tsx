/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Stack, Text } from '@commercetools/nimbus';
import { ConfigureMCPProviders } from '../../configuration/configure-mcp-providers';

/**
 * The optional systems the assistant can reach beyond commercetools itself.
 *
 * Each source needs credentials (an API key, a management token, a server URL), and those
 * are set by whoever operates the deployment, in the Connect configuration. This section
 * only shows the result, to every member, as read-only status cards.
 */
export const ConnectedSources: React.FC = () => (
  <Stack direction="column" gap="200">
    <Text fontWeight="600" fontSize="350">
      Connected sources
    </Text>
    <Text fontSize="300" color="neutral.11">
      The sources an operator has configured for this project. commercetools is
      always available.
    </Text>
    <ConfigureMCPProviders />
  </Stack>
);
