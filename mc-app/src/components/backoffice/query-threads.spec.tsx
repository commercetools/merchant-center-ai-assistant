/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import alasql from 'alasql';
import type { BackofficeThread } from '../../hooks/admin-types';
import QueryThreads from './query-threads';

const mockGetBackofficeThreads = jest.fn();
const mockConnector = { getBackofficeThreads: mockGetBackofficeThreads };

jest.mock('../../hooks/use-admin-connector', () => ({
  useAdminConnector: () => mockConnector,
}));

const thread = (
  sessionId: string,
  overrides: Partial<BackofficeThread> = {}
): BackofficeThread => ({
  sessionId,
  userId: `user-${sessionId}`,
  messages: [],
  ...overrides,
});

const respond = (threads: BackofficeThread[]) =>
  mockGetBackofficeThreads.mockResolvedValue({
    success: true,
    data: threads,
    pagination: { total: threads.length, limit: 100, offset: 0 },
  });

const renderTab = () =>
  render(
    <NimbusProvider>
      <QueryThreads />
    </NimbusProvider>
  );

const runQuery = async (sql: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'SQL Query' }), {
    target: { value: sql },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run Query' }));
};

beforeEach(() => {
  mockGetBackofficeThreads.mockReset();
});

describe('QueryThreads', () => {
  it('loads one page with the default limit and offset and reports the table', async () => {
    respond([thread('s1'), thread('s2')]);
    renderTab();

    expect(await screen.findByText(/2 rows/)).toBeTruthy();
    expect(mockGetBackofficeThreads).toHaveBeenCalledWith({}, 100, 0);
  });

  it('inserts the rows through alasql with the derived columns', async () => {
    respond([
      thread('s1', {
        userLabel: 'a@example.invalid',
        title: 'Orders',
        messages: [
          { id: 'm1', role: 'user' },
          { id: 'm2', role: 'assistant' },
        ],
      }),
      thread('s2'),
    ]);
    renderTab();
    expect(await screen.findByText(/2 rows/)).toBeTruthy();

    const rows = alasql(
      'SELECT sessionId, userLabel, title, messageCount, messages FROM threads ORDER BY sessionId'
    ) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sessionId: 's1',
      userLabel: 'a@example.invalid',
      title: 'Orders',
      messageCount: 2,
    });
    expect(JSON.parse(rows[0].messages as string)).toHaveLength(2);
    // Missing optionals become NULL, and the transcript of an empty thread is an empty array.
    expect(rows[1]).toMatchObject({
      sessionId: 's2',
      userLabel: null,
      title: null,
      messageCount: 0,
      messages: '[]',
    });
  });

  it('runs SQL over the loaded table and shows the result as JSON', async () => {
    respond([
      thread('s1', { title: 'Orders' }),
      thread('s2', { title: 'Prices' }),
    ]);
    renderTab();
    expect(await screen.findByText(/2 rows/)).toBeTruthy();

    await runQuery("SELECT sessionId FROM threads WHERE title = 'Prices'");

    expect(await screen.findByText(/"sessionId": "s2"/)).toBeTruthy();
    expect(screen.queryByText(/"sessionId": "s1"/)).toBeNull();
  });

  it('matches the transcript text with LIKE on the flattened messages column', async () => {
    respond([
      thread('s1', {
        messages: [
          {
            id: 'm1',
            role: 'user',
            parts: [{ type: 'text', text: 'refund please' }],
          },
        ],
      }),
      thread('s2'),
    ]);
    renderTab();
    expect(await screen.findByText(/2 rows/)).toBeTruthy();

    await runQuery(
      "SELECT sessionId FROM threads WHERE messages LIKE '%refund%'"
    );

    expect(await screen.findByText(/"sessionId": "s1"/)).toBeTruthy();
  });

  it('shows the SQL error and no result for a broken query', async () => {
    respond([thread('s1')]);
    renderTab();
    expect(await screen.findByText(/1 rows/)).toBeTruthy();

    await runQuery('SELEC nonsense FROM');

    expect(await screen.findByText(/Error/i)).toBeTruthy();
  });

  it('does not duplicate rows when the table is loaded again', async () => {
    respond([thread('s1'), thread('s2')]);
    renderTab();
    expect(await screen.findByText(/2 rows/)).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Limit' }), {
      target: { value: '50' },
    });
    await waitFor(() =>
      expect(mockGetBackofficeThreads).toHaveBeenLastCalledWith({}, 50, 0)
    );
    expect(await screen.findByText(/2 rows/)).toBeTruthy();

    const count = alasql('SELECT COUNT(*) AS n FROM threads') as Array<{
      n: number;
    }>;
    expect(count[0].n).toBe(2);
  });

  it('ignores a non-positive limit and a negative offset', async () => {
    respond([thread('s1')]);
    renderTab();
    expect(await screen.findByText(/1 rows/)).toBeTruthy();
    const calls = mockGetBackofficeThreads.mock.calls.length;

    fireEvent.change(screen.getByRole('textbox', { name: 'Limit' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Offset' }), {
      target: { value: '-5' },
    });
    expect(mockGetBackofficeThreads).toHaveBeenCalledTimes(calls);
  });

  it('shows the load error and keeps the query box disabled', async () => {
    mockGetBackofficeThreads.mockRejectedValue(new Error('boom'));
    renderTab();

    expect(await screen.findByText(/boom|Failed to load threads/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Run Query' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
