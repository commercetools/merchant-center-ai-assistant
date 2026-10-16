/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { UIMessage } from 'ai';
import { getMetadataFromMessage } from '../utils/metadata.utils';
import { ANNOTATIONS_PART_TYPE } from './annotation-part';
import {
  STORABLE_TOOLS,
  SUBAGENT_TOOL_NAMES,
  TURN_STATUS_PART_TYPE,
} from './constants';

/** A message as it is persisted (a subset of the UI message). */
export interface StorableMessage {
  id: string;
  role: UIMessage['role'];
  parts: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

type Part = Record<string, unknown> & { type?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The storable tool whose part type this is (`tool-visualize_data` -> `visualize_data`). */
const storableToolOf = (part: Part): string | undefined =>
  STORABLE_TOOLS.find((tool) => `tool-${tool}` === part.type);

const subagentToolOf = (part: Part): string | undefined =>
  SUBAGENT_TOOL_NAMES.find((name) => `tool-${name}` === part.type);

/** A web URL or a service-relative `/files/...` path; never a base64 `data:` URL. */
const isStorableUrl = (url: unknown): url is string =>
  typeof url === 'string' && url !== '' && !url.startsWith('data:');

/**
 * Nested parts of a subagent output reduced to what is worth storing: text, files with a
 * storable URL, and terminal outputs of storable tools.
 */
const filterSubagentOutputParts = (
  parts: unknown
): Array<Record<string, unknown>> => {
  if (!Array.isArray(parts)) return [];
  const kept: Array<Record<string, unknown>> = [];
  for (const nested of parts) {
    if (!isRecord(nested)) continue;
    if (nested.type === 'text' && str(nested.text)) {
      kept.push({ type: 'text', text: nested.text });
    } else if (
      nested.type === 'file' &&
      str(nested.mediaType) &&
      isStorableUrl(nested.url)
    ) {
      kept.push({ type: 'file', url: nested.url, mediaType: nested.mediaType });
    } else {
      const tool = storableToolOf(nested);
      if (tool && nested.state === 'output-available' && nested.output) {
        kept.push({
          type: nested.type,
          toolCallId: str(nested.toolCallId) ?? '',
          toolName: tool,
          state: nested.state,
          output: nested.output,
        });
      }
    }
  }
  return kept;
};

const toStorableToolPart = (part: Part, terminal: boolean): Record<string, unknown> | null => {
  const storable = storableToolOf(part);
  if (storable) {
    return terminal
      ? {
          type: part.type,
          toolCallId: str(part.toolCallId) ?? '',
          toolName: storable,
          state: part.state,
          output: part.output ?? null,
        }
      : null;
  }

  const subagent = subagentToolOf(part);
  if (subagent) {
    if (!terminal) return null;
    const output = isRecord(part.output) ? part.output : {};
    return {
      type: part.type,
      toolCallId: str(part.toolCallId) ?? '',
      toolName: subagent,
      state: part.state,
      output: {
        role: str(output.role) ?? 'assistant',
        parts: filterSubagentOutputParts(output.parts),
      },
    };
  }

  return null;
};

const toStorablePart = (part: Part): Record<string, unknown> | null => {
  // Transient parts (keep-alive) and unknown data parts are never stored.
  if (part.transient === true) return null;

  if (part.type === 'text') {
    return str(part.text) ? { type: 'text', text: part.text } : null;
  }

  if (part.type === 'file') {
    return str(part.mediaType) && isStorableUrl(part.url)
      ? { type: 'file', url: part.url, mediaType: part.mediaType }
      : null;
  }

  // The preview-annotation part is preserved as is: its `data` is the contract, and dropping it
  // would erase the annotations from history after the turn that carried them. The persisted
  // time-limit marker is kept the same way.
  if (part.type === ANNOTATIONS_PART_TYPE || part.type === TURN_STATUS_PART_TYPE) {
    return part.data ? { type: part.type, data: part.data } : null;
  }

  return toStorableToolPart(part, part.state === 'output-available' && 'output' in part);
};

/**
 * Reduces the conversation of a finished turn to what is persisted (capability
 * chat-stream-endpoint, "Storage filter"): non-empty text, files with non-`data:` URLs
 * (web URLs and service-relative `/files/...` paths), annotation parts, the time-limit
 * marker, terminal outputs of the storable tools, subagent outputs with their nested parts
 * reduced, plus the `metadata.usage` counters. Messages left with no part are dropped.
 */
export const processMessagesForStorage = (
  messages: ReadonlyArray<Pick<UIMessage, 'id' | 'role' | 'parts' | 'metadata'>>
): StorableMessage[] =>
  messages
    .map((message): StorableMessage => {
      const parts = (message.parts as Part[])
        .map(toStorablePart)
        .filter((part): part is Record<string, unknown> => part !== null);
      return {
        id: message.id,
        role: message.role,
        parts,
        ...getMetadataFromMessage(message),
      };
    })
    .filter((message) => message.parts.length > 0);
