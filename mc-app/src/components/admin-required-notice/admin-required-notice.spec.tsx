/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import AdminRequiredNotice from './index';

jest.mock('../../contexts/auth', () => ({
  useAuth: () => ({ userId: 'user-id-123' }),
}));

const renderIt = (context?: 'managed-mcp' | 'backoffice' | 'generic') =>
  render(
    <NimbusProvider>
      <AdminRequiredNotice context={context} />
    </NimbusProvider>
  );

describe('AdminRequiredNotice', () => {
  it('shows the heading and the ADMIN_USER_IDS instruction', () => {
    renderIt();
    expect(
      screen.getByRole('heading', { name: 'Administrator access required' })
    ).toBeTruthy();
    expect(screen.getByText(/ADMIN_USER_IDS/)).toBeTruthy();
  });

  it('shows the read-only user id line', () => {
    renderIt();
    expect(screen.getByText('Your user ID:')).toBeTruthy();
    expect(screen.getByText('user-id-123')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it.each(['managed-mcp', 'backoffice', 'generic'] as const)(
    'contains no e-mail character or link (%s)',
    (context) => {
      renderIt(context);
      expect(document.body.innerHTML).not.toContain('@');
      expect(screen.queryByRole('link')).toBeNull();
      expect(document.body.innerHTML).not.toContain('mailto');
    }
  );
});
