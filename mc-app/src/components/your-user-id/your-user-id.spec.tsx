/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { YourUserId } from './index';

let mockUserId: string | null = 'user-id-123';

jest.mock('../../contexts/auth', () => ({
  useAuth: () => ({ userId: mockUserId }),
}));

const renderIt = () =>
  render(
    <NimbusProvider>
      <YourUserId />
    </NimbusProvider>
  );

describe('YourUserId', () => {
  it('shows the id and has no form field', () => {
    mockUserId = 'user-id-123';
    renderIt();
    expect(screen.getByText('user-id-123')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders nothing without a user id', () => {
    mockUserId = null;
    renderIt();
    expect(screen.queryByText('Your user ID:')).toBeNull();
  });

  it('copies the id and shows Copied', async () => {
    mockUserId = 'user-id-123';
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('user-id-123');
    expect(await screen.findByText('Copied')).toBeTruthy();
  });
});
