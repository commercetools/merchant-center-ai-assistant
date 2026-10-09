/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ChatMessage } from '@commercetools/nimbus';
import { useToolCallLogsConfigContext } from '../../../contexts/tool-call-logs-config';
import { CuteTextAnimator } from './cute-text-animator';
import { AgentAvatar } from '../agent-avatar';

/**
 * Shown while the agent is generating.
 *
 * `ChatMessage.Typing` rather than a bare `ActivityIndicator`: it is the chat-specific form
 * of the same affordance, it sits correctly inside a `ChatMessage.Root` now that `MessageRow`
 * is gone, and it treats the dots as decorative (`aria-hidden`) while announcing whatever
 * label is passed as children. `ActivityIndicator` remains the right choice for non-chat
 * spinners.
 *
 * Carries the agent avatar, and `sender="agent"` puts it on the same side as a real reply,
 * so the indicator occupies the spot the answer is about to appear in rather than shifting
 * when it does.
 *
 * `CuteTextAnimator` is kept as that label: it is copy rather than a loading affordance, and
 * it only appears when tool-call logs are hidden and there would otherwise be nothing to read
 * while waiting.
 */
export const TypingIndicator: React.FC = () => {
  const { state } = useToolCallLogsConfigContext();
  const showCuteText = state.mode === 'none';

  return (
    <ChatMessage.Root sender="agent" isStreaming>
      <AgentAvatar />
      <ChatMessage.Body>
        <ChatMessage.Typing>
          {showCuteText && <CuteTextAnimator />}
        </ChatMessage.Typing>
      </ChatMessage.Body>
    </ChatMessage.Root>
  );
};

export default TypingIndicator;
