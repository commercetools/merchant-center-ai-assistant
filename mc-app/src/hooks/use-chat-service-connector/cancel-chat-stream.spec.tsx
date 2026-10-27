/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { renderHook } from '@testing-library/react';
import { useChatServiceConnector } from './use-chat-service-connector';

const mockRequest = jest.fn();

jest.mock('./request', () => ({
  ...jest.requireActual('./request'),
  useServiceRequest: () => mockRequest,
  useServiceBlobRequest: () => jest.fn(),
}));

describe('cancelChatStream', () => {
  beforeEach(() => {
    mockRequest.mockReset().mockResolvedValue({ success: true });
  });

  it('sends DELETE to the stream path of the session', async () => {
    const { result } = renderHook(() => useChatServiceConnector());
    await result.current.cancelChatStream('s1');
    expect(mockRequest).toHaveBeenCalledWith(
      'DELETE',
      'ai-chat/s1/message/stream'
    );
  });

  it('names the turn when it is given one', async () => {
    const { result } = renderHook(() => useChatServiceConnector());
    await result.current.cancelChatStream('s1', 'm 1');
    expect(mockRequest).toHaveBeenCalledWith(
      'DELETE',
      'ai-chat/s1/message/stream?messageId=m%201'
    );
  });
});
