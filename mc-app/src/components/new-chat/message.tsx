/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

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
  /** Must REJECT on failure so the rating button does not claim success. */
  onRate?: (sentiment: 'up' | 'down') => Promise<void>;
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
 * For an assistant reply the order is deliberate: what it DID comes first, as a single
 * collapsed pill, then what it SAID. The plumbing is available to anyone who wants it and
 * out of the way of everyone who does not - previously each tool call rendered as its own
 * bordered card, so a six-call answer buried the actual reply under a wall of boxes.
 *
 * `ChatMessage.Root` owns what a hand-rolled row/bubble/role trio used to: `sender` drives
 * the surface tint, the body's measure and which side the avatar sits on, and
 * `isStreaming` sets `aria-busy`.
 *
 * The one thing `sender` does NOT do is place the message in the column. Left to the
 * recipe, `ChatMessage.Root` is `width: fit-content` over two `auto` grid tracks, so a
 * bubble never grows past its own content and both senders stack against the left edge.
 * So the root is stretched across the whole list item and the body's track takes the
 * leftover space - `1fr` on the right for the agent, on the left for the user.
 *
 * `maxWidth` on the body then lifts Nimbus's per-sender caps (480px user, 632px agent) to
 * the full width of the chat column. The asymmetry is deliberate in the design system, but
 * assistant replies here routinely carry tables, charts and code blocks that 632px
 * squeezes into a ribbon. The body keeps `width: fit-content`, so short messages still hug
 * their text.
 */
export const Message: React.FC<MessageProps> = ({
  message,
  isLatestAssistant = false,
  isStreaming: isStreamingProp,
  onRegenerate,
  onRate,
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

        {showActions && onRegenerate && onRate && (
          <MessageActions
            message={message}
            canRegenerate={isLatestAssistant}
            onRegenerate={onRegenerate}
            onRate={onRate}
          />
        )}
      </ChatMessage.Body>
    </ChatMessage.Root>
  );
};
