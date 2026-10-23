/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import type { BackofficeThread } from '../../hooks/admin-types';
import BackofficeThreadList from './thread-list';

// The Nimbus DataTable measures its columns; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub,
});

const mockGetBackofficeThreads = jest.fn();
const mockConnector = { getBackofficeThreads: mockGetBackofficeThreads };
const mockHistory = { push: jest.fn() };

jest.mock('../../hooks/use-admin-connector', () => ({
  useAdminConnector: () => mockConnector,
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => mockHistory,
  useRouteMatch: () => ({ url: '/p/app/backoffice' }),
}));

const thread = (sessionId: string): BackofficeThread => ({
  sessionId,
  userId: `user-${sessionId}`,
  messages: [],
});

const respond = (threads: BackofficeThread[], total = threads.length) =>
  mockGetBackofficeThreads.mockResolvedValue({
    success: true,
    data: threads,
    pagination: { total, limit: 20, offset: 0 },
  });

const renderList = () =>
  render(
    <NimbusProvider>
      <BackofficeThreadList />
    </NimbusProvider>
  );

beforeEach(() => {
  mockGetBackofficeThreads.mockReset();
  mockHistory.push.mockReset();
});

describe('BackofficeThreadList', () => {
  it('loads the first page of 20 without a filter', async () => {
    respond([thread('s1')]);
    renderList();
    await waitFor(() =>
      expect(mockGetBackofficeThreads).toHaveBeenCalledWith({}, 20, 0)
    );
    expect(await screen.findByText('s1')).toBeTruthy();
  });

  it('filters by the exact user id typed, trimmed', async () => {
    respond([thread('s1')]);
    renderList();
    await waitFor(() => expect(mockGetBackofficeThreads).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('textbox', { name: 'User ID' }), {
      target: { value: '  user-s1  ' },
    });

    await waitFor(() =>
      expect(mockGetBackofficeThreads).toHaveBeenLastCalledWith(
        { userId: 'user-s1' },
        20,
        0
      )
    );
  });

  it('drops the filter again when the box holds only blanks', async () => {
    respond([thread('s1')]);
    renderList();
    await waitFor(() => expect(mockGetBackofficeThreads).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('textbox', { name: 'User ID' }), {
      target: { value: '   ' },
    });

    await waitFor(() =>
      expect(mockGetBackofficeThreads).toHaveBeenLastCalledWith({}, 20, 0)
    );
  });

  it('renders one row per thread with the session id and the verified user', async () => {
    respond([thread('s1'), thread('s2')]);
    renderList();
    await screen.findByText('s1');
    expect(screen.getByText('s2')).toBeTruthy();
    expect(screen.getByText('user-s1')).toBeTruthy();
    expect(screen.getByText('user-s2')).toBeTruthy();
  });

  it('shows the error instead of the table when the read fails', async () => {
    mockGetBackofficeThreads.mockRejectedValue(new Error('gateway down'));
    renderList();
    expect(await screen.findByText('Could not load threads')).toBeTruthy();
    expect(screen.queryByText('s1')).toBeNull();
  });
});
