/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { ProviderStatusCard } from '../../configure-mcp/provider-status-card';
import { AboutSection } from './about-section';

jest.mock('../../../contexts/auth', () => ({
  useAuth: () => ({ userId: 'user-id-123' }),
}));

const wrap = (node: React.ReactNode) =>
  render(<NimbusProvider>{node}</NimbusProvider>);

describe('AboutSection', () => {
  it('shows the user id and the instruction for a non-admin', () => {
    wrap(<AboutSection isAdmin={false} />);
    expect(screen.getByText('user-id-123')).toBeTruthy();
    expect(
      screen.getByText(
        'Ask an administrator to add your user ID to ADMIN_USER_IDS'
      )
    ).toBeTruthy();
  });

  it('shows the user id only for an admin', () => {
    wrap(<AboutSection isAdmin />);
    expect(screen.getByText('user-id-123')).toBeTruthy();
    expect(screen.queryByText(/ADMIN_USER_IDS/)).toBeNull();
  });
});

describe('ProviderStatusCard', () => {
  it('is read-only and says where the credentials live', () => {
    wrap(
      <ProviderStatusCard
        status={{
          provider: 'stripe',
          configured: true,
          enabled: true,
          missingKeys: [],
        }}
      />
    );
    expect(screen.getByText('Stripe')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(
      screen.getByText('Configured at deployment (Connect configuration)')
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('lists the missing key names when not configured', () => {
    wrap(
      <ProviderStatusCard
        status={{
          provider: 'algolia',
          configured: false,
          enabled: false,
          missingKeys: ['ALGOLIA_APP_ID', 'ALGOLIA_API_KEY'],
        }}
      />
    );
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(
      screen.getByText('Missing: ALGOLIA_APP_ID, ALGOLIA_API_KEY')
    ).toBeTruthy();
  });
});
