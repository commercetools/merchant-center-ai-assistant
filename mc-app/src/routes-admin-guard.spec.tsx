/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import AdminGuard from './components/admin-guard';

let mockAuth = { isAdmin: false, isAuthenticated: true, userId: 'user-id-123' };

jest.mock('./contexts/auth', () => ({
  useAuth: () => mockAuth,
}));

const renderGuard = () =>
  render(
    <NimbusProvider>
      <AdminGuard>
        <div>secret admin page</div>
      </AdminGuard>
    </NimbusProvider>
  );

describe('AdminGuard', () => {
  it('shows the notice and not the children for a non-admin', () => {
    mockAuth = { isAdmin: false, isAuthenticated: true, userId: 'u1' };
    renderGuard();
    expect(screen.getByText('Administrator access required')).toBeTruthy();
    expect(screen.queryByText('secret admin page')).toBeNull();
  });

  it('shows the children for an admin', () => {
    mockAuth = { isAdmin: true, isAuthenticated: true, userId: 'u1' };
    renderGuard();
    expect(screen.getByText('secret admin page')).toBeTruthy();
    expect(screen.queryByText('Administrator access required')).toBeNull();
  });

  it('fails closed while the session is not authenticated', () => {
    mockAuth = { isAdmin: true, isAuthenticated: false, userId: 'u1' };
    renderGuard();
    expect(screen.queryByText('secret admin page')).toBeNull();
  });

  it('includes the user id line and the ADMIN_USER_IDS text, and no @', () => {
    mockAuth = { isAdmin: false, isAuthenticated: true, userId: 'user-77' };
    renderGuard();
    expect(screen.getByText('user-77')).toBeTruthy();
    expect(screen.getByText(/ADMIN_USER_IDS/)).toBeTruthy();
    expect(document.body.innerHTML).not.toContain('@');
  });
});
