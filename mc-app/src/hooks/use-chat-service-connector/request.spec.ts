/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createServiceBlobRequest, createServiceRequest } from './request';

const mockForwardToFetch = jest.fn();

jest.mock('../../utils/forward-to', () => {
  const actual = jest.requireActual('../../utils/forward-to');
  return {
    ...actual,
    forwardToFetch: (...args: unknown[]) => mockForwardToFetch(...args),
    forwardToJson: async (uri: string, init?: RequestInit) => {
      const res = await mockForwardToFetch(uri, init);
      if (!res.ok) {
        throw new actual.ForwardToError(uri, res.status, await res.text());
      }
      return res.json();
    },
  };
});

const ENDPOINT = 'https://service.example.invalid/service/';

describe('createServiceRequest', () => {
  beforeEach(() => mockForwardToFetch.mockReset());

  it('builds the URL from the endpoint and sends a JSON body without any identity', async () => {
    mockForwardToFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    const request = createServiceRequest(ENDPOINT);
    const result = await request('POST', 'session', { title: 'New chat' });

    expect(result).toEqual({ success: true });
    const [uri, init] = mockForwardToFetch.mock.calls[0];
    expect(uri).toBe(`${ENDPOINT}session`);
    expect(uri).not.toContain('userEmail');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'New chat' }));
  });

  it('sends no body when none is given', async () => {
    mockForwardToFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await createServiceRequest(ENDPOINT)('GET', 'session/all');
    expect(mockForwardToFetch.mock.calls[0][1]).toEqual({ method: 'GET' });
  });

  it('throws a ForwardToError carrying the status on a non-ok answer', async () => {
    mockForwardToFetch.mockResolvedValue(
      new Response('{"success":false}', { status: 404 })
    );
    await expect(
      createServiceRequest(ENDPOINT)('GET', 'session/x/messages')
    ).rejects.toMatchObject({ name: 'ForwardToError', status: 404 });
  });

  it('fails clearly when the endpoint is not configured', async () => {
    await expect(
      createServiceRequest(undefined)('GET', 'session')
    ).rejects.toThrow('not configured');
  });
});

describe('createServiceBlobRequest', () => {
  beforeEach(() => mockForwardToFetch.mockReset());

  it('returns the blob of an ok answer', async () => {
    mockForwardToFetch.mockResolvedValue(
      new Response(new Blob(['x'], { type: 'image/png' }), { status: 200 })
    );
    const blob = await createServiceBlobRequest(ENDPOINT)('files/s/1-aa.png');
    expect(blob.size).toBeGreaterThan(0);
    expect(mockForwardToFetch.mock.calls[0][0]).toBe(
      `${ENDPOINT}files/s/1-aa.png`
    );
  });

  it('throws on a non-ok answer', async () => {
    mockForwardToFetch.mockResolvedValue(new Response('no', { status: 403 }));
    await expect(
      createServiceBlobRequest(ENDPOINT)('files/s/1-aa.png')
    ).rejects.toMatchObject({ status: 403 });
  });
});
