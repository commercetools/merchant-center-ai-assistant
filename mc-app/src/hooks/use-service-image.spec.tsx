/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useServiceImage } from './use-service-image';

const mockRequestBlob = jest.fn();

jest.mock('./use-chat-service-endpoint', () => ({
  useChatServiceEndpoint: () => ({
    chatServiceEndpointUrl: 'https://service.example.invalid/service/',
  }),
}));

jest.mock('./use-chat-service-connector/request', () => ({
  createServiceBlobRequest: () => mockRequestBlob,
}));

describe('useServiceImage', () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    mockRequestBlob.mockReset();
    created.length = 0;
    revoked.length = 0;
    let n = 0;
    URL.createObjectURL = jest.fn(() => {
      const u = `blob:test/${(n += 1)}`;
      created.push(u);
      return u;
    });
    URL.revokeObjectURL = jest.fn((u: string) => {
      revoked.push(u);
    });
  });

  it('stays idle for urls that are not service files', () => {
    const { result } = renderHook(() =>
      useServiceImage('https://x.invalid/a.png')
    );
    expect(result.current.status).toBe('idle');
    expect(mockRequestBlob).not.toHaveBeenCalled();
  });

  it('loads an image and revokes the object url on unmount', async () => {
    mockRequestBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    const { result, unmount } = renderHook(() =>
      useServiceImage('/files/s1/1-aaaaaaaa.png')
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockRequestBlob.mock.calls[0][0]).toBe('files/s1/1-aaaaaaaa.png');
    expect(created).toHaveLength(1);
    unmount();
    expect(revoked).toEqual(created);
  });

  it('reports an error for a non-image answer and recovers on retry', async () => {
    mockRequestBlob.mockResolvedValueOnce(
      new Blob(['x'], { type: 'text/html' })
    );
    const { result } = renderHook(() =>
      useServiceImage('/files/s1/2-bbbbbbbb.png')
    );
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockRequestBlob.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' })
    );
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('reports an error when the request fails', async () => {
    mockRequestBlob.mockRejectedValue(new Error('403'));
    const { result } = renderHook(() =>
      useServiceImage('/files/s1/3-cccccccc.png')
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
