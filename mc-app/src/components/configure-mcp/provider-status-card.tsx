/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Text } from '@commercetools/nimbus';
import React from 'react';
import type {
  McpProviderName,
  McpProviderStatus,
} from '../../hooks/admin-types';
import { StatusCard } from './form-parts';

const LABELS: Record<McpProviderName, string> = {
  contentstack: 'Contentstack',
  algolia: 'Algolia',
  stripe: 'Stripe',
};

type Props = {
  status: Pick<
    McpProviderStatus,
    'provider' | 'configured' | 'enabled' | 'missingKeys'
  >;
};

/**
 * One third-party provider as the service reports it. Read-only: provider credentials are
 * Connect deployment configuration, so this card shows a state and never an input. It
 * renders names and booleans only; nothing here can hold a secret.
 */
export const ProviderStatusCard: React.FC<Props> = ({ status }) => (
  <StatusCard
    label={LABELS[status.provider] ?? status.provider}
    isEnabled={status.enabled}
    badgeText={status.enabled ? 'Enabled' : 'Not configured'}
  >
    <Text fontSize="300" color="neutral.11">
      Configured at deployment (Connect configuration)
    </Text>
    {status.missingKeys.length > 0 && (
      <Text fontSize="300" color="neutral.11">
        Missing: {status.missingKeys.join(', ')}
      </Text>
    )}
  </StatusCard>
);

export default ProviderStatusCard;
