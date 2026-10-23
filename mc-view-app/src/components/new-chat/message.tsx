/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/message.tsx without rating.

import React from 'react';
import { UIMessage } from 'ai';
import { ChatMessage } from '@commercetools/nimbus';
import { PartRenderer } from './parts';
import { ToolSteps } from './parts/tool-steps';
import { AgentAvatar } from './agent-avatar';
import { MessageActions } from './message-actions';
import { ThinkingPill } from './thinking-pill';
import { UserAvatar } from './user-avatar';

interface MessageProps {
  message: UIMessage;
  /** The newest assistant reply. Only that one offers "try again" and rating. */
  isLatestAssistant?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

/** Any text the message has produced so far, at the top level or inside a subagent reply. */
const hasVisibleText = (message: UIMessage): boolean =>
  (message.parts ?? []).some((part) => {
    if (part.type === 'text') return Boolean((part as { text?: string }).text);
    const nested = (
      part as { output?: { parts?: { type: string; text?: string }[] } }
    ).output?.parts;
    return Array.isArray(nested)
      ? nested.some((inner) => inner.type === 'text' && Boolean(inner.text))
      : false;
  });

/**
 * One message in the transcript.
 *
 * For an assistant reply what it DID comes first, as a single collapsed pill, then what it
 * SAID. `ChatMessage.Root` is stretched across the list item and the body's track takes the
 * leftover space (`1fr` on the right for the agent, on the left for the user); `maxWidth`
 * lifts Nimbus's per-sender caps so tables and charts are not squeezed.
 */
export const Message: React.FC<MessageProps> = ({
  message,
  isLatestAssistant = false,
  isStreaming: isStreamingProp,
  onRegenerate,
}) => {
  const isUser = message.role === 'user';
  const isStreaming =
    isStreamingProp ??
    message.parts?.some(
      (part) => 'state' in part && part.state === 'streaming'
    );

  // Nothing written yet, but the turn is live: say so where the answer will appear.
  const isThinking = !isUser && isStreaming && !hasVisibleText(message);
  const showActions = !isUser && !isStreaming && hasVisibleText(message);

  return (
    <ChatMessage.Root
      sender={isUser ? 'user' : 'agent'}
      isStreaming={isStreaming}
      width="100%"
      gridTemplateColumns={isUser ? '1fr auto' : 'auto 1fr'}
    >
      {isUser ? <UserAvatar /> : <AgentAvatar />}
      <ChatMessage.Body maxWidth="100%">
        {!isUser && <ToolSteps parts={message.parts} />}

        {message.parts?.map((part, index) => (
          <PartRenderer
            key={index}
            part={part}
            isUser={isUser}
            isStreaming={isStreaming}
          />
        ))}

        {isThinking && <ThinkingPill />}

        {showActions && onRegenerate && (
          <MessageActions
            message={message}
            canRegenerate={isLatestAssistant}
            onRegenerate={onRegenerate}
          />
        )}
      </ChatMessage.Body>
    </ChatMessage.Root>
  );
};
