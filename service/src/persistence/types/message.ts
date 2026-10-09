/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isRecord } from './session';

export type MessageRole = 'user' | 'assistant' | 'system';

/** An AI SDK UI message. `parts` is opaque here (a JSON array). */
export interface StoredMessage {
  id: string;
  role: MessageRole;
  parts: unknown[];
  timestamp: number;
}

export interface MessageValue {
  v: 1;
  id: string;
  role: MessageRole;
  timestamp: number;
  /** `JSON.stringify(parts)`: a string because the platform drops `null` members. */
  partsJson: string;
}

export function messageToValue(m: StoredMessage): MessageValue {
  return {
    v: 1,
    id: m.id,
    role: m.role,
    timestamp: m.timestamp,
    partsJson: JSON.stringify(m.parts),
  };
}

export function messageFromValue(v: unknown): StoredMessage {
  const o = isRecord(v) ? v : {};
  let parts: unknown[] = [];
  if (typeof o.partsJson === 'string') {
    try {
      const parsed: unknown = JSON.parse(o.partsJson);
      if (Array.isArray(parsed)) parts = parsed;
    } catch {
      parts = [];
    }
  }
  const role = o.role === 'user' || o.role === 'system' ? o.role : 'assistant';
  return {
    id: typeof o.id === 'string' ? o.id : '',
    role,
    parts,
    timestamp: typeof o.timestamp === 'number' ? o.timestamp : 0,
  };
}
