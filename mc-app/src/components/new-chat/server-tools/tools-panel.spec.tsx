/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import type { McpProviderStatus } from '../../../hooks/admin-types';
import { findUnconfiguredProvider } from './provider-status';
import { ToolsPanel } from './tools-panel';

let mockProviders: McpProviderStatus[] = [];
const mockEnsureProvidersLoaded = jest.fn(() => Promise.resolve());

jest.mock('../../../contexts/mcp-providers', () => ({
  useMcpProviders: () => ({
    providers: mockProviders,
    ensureProvidersLoaded: mockEnsureProvidersLoaded,
  }),
}));

// Stable references: the panel copies `sessionTools` in an effect keyed on it.
const mockSession = {
  isLoadingTools: false,
  updateTools: jest.fn(),
  sessionTools: [
    {
      mcp: 'commercetools',
      tools: [{ toolName: 'read_products', enabled: true }],
    },
    { mcp: 'stripe', tools: [{ toolName: 'list_customers', enabled: false }] },
  ],
};

jest.mock('../../../contexts/session', () => ({
  useSession: () => mockSession,
}));

const status = (
  provider: McpProviderStatus['provider'],
  configured: boolean,
  missingKeys: string[] = []
): McpProviderStatus => ({
  provider,
  configured,
  enabled: configured,
  missingKeys,
});

describe('findUnconfiguredProvider', () => {
  it('returns the missing keys of an unconfigured provider', () => {
    expect(
      findUnconfiguredProvider(
        [status('stripe', false, ['STRIPE_KEY'])],
        'stripe'
      )
    ).toEqual({ missingKeys: ['STRIPE_KEY'] });
  });

  it('ignores configured providers, unknown sources and an empty status list', () => {
    expect(
      findUnconfiguredProvider([status('stripe', true)], 'stripe')
    ).toBeUndefined();
    expect(
      findUnconfiguredProvider([status('stripe', false)], 'commercetools')
    ).toBeUndefined();
    expect(findUnconfiguredProvider([], 'stripe')).toBeUndefined();
  });
});

describe('ToolsPanel provider status', () => {
  const renderPanel = () =>
    render(
      <NimbusProvider>
        <ToolsPanel />
      </NimbusProvider>
    );

  beforeEach(() => {
    mockEnsureProvidersLoaded.mockClear();
  });

  it('asks for the provider status once on mount', () => {
    mockProviders = [];
    renderPanel();
    expect(mockEnsureProvidersLoaded).toHaveBeenCalledTimes(1);
  });

  it('greys out and disables the tools of an unconfigured provider', () => {
    mockProviders = [status('stripe', false, ['STRIPE_RESTRICTED_KEY'])];
    renderPanel();
    expect(screen.getAllByText('Not configured')).toHaveLength(1);
    expect(screen.getByText(/STRIPE_RESTRICTED_KEY/)).toBeTruthy();
    const toggleAll = screen.getByLabelText(
      'Toggle all stripe tools'
    ) as HTMLInputElement;
    expect(toggleAll.disabled).toBe(true);
    const commerce = screen.getByLabelText(
      'Toggle all commercetools tools'
    ) as HTMLInputElement;
    expect(commerce.disabled).toBe(false);
  });

  it('leaves every group enabled while the provider status is unknown', () => {
    mockProviders = [];
    renderPanel();
    expect(screen.queryByText('Not configured')).toBeNull();
    const toggleAll = screen.getByLabelText(
      'Toggle all stripe tools'
    ) as HTMLInputElement;
    expect(toggleAll.disabled).toBe(false);
  });
});
