/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { UIMessage } from 'ai';

// ============================================================================
// Types
// ============================================================================

export type MessagePart = UIMessage['parts'][number];

export interface ToolInvocationPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** True when the output is a preliminary (streaming) result from a subagent */
  preliminary?: boolean;
}

export interface NewChatProps {
  url: string;
  sessionId: string;
  initialMessages: UIMessage[];
}

export interface MessageProps {
  message: UIMessage;
}

export interface PartRendererProps {
  part: MessagePart;
  isUser: boolean;
  isStreaming?: boolean;
}

// Helper to safely extract tool part properties
export const extractToolPartProps = (
  part: MessagePart
): ToolInvocationPart | null => {
  if (!('state' in part)) return null;
  const p = part as Record<string, unknown>;

  // Extract tool name - either from toolName property or from type (tool-{name})
  let toolName = p.toolName ? String(p.toolName) : undefined;
  const typeStr = String(p.type || '');
  if (!toolName && typeStr.startsWith('tool-')) {
    toolName = typeStr.replace('tool-', '');
  }

  return {
    type: typeStr,
    toolCallId: String(p.toolCallId || ''),
    toolName,
    state: String(p.state || ''),
    input: p.input,
    output: p.output,
    errorText: p.errorText ? String(p.errorText) : undefined,
    preliminary: p.preliminary === true,
  };
};
