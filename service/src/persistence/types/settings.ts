/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Envelope } from '../../crypto/envelope';
import { isRecord } from './session';

export const TOOL_CALL_LOG_MODES = ['none', 'thinking', 'tools', 'all'] as const;
export type ToolCallLogsMode = (typeof TOOL_CALL_LOG_MODES)[number];

/** The project's dynamically registered OAuth client; the secret part is an encrypted envelope. */
export interface IdentityMcpClientRecord {
  encryptedClient: Envelope;
  /** First characters of the client id, for logs. */
  clientIdPrefix: string;
  redirectUri: string;
  registeredScope?: string;
  issuer?: string;
  tokenEndpoint?: string;
  /** Epoch ms. */
  registeredAt: number;
}

export interface IdentityMcpDiscoveryRecord {
  resourceMetadataUrl?: string;
  resource?: string;
  authorizationServers: string[];
  scopesSupported?: string[];
  /** Epoch ms. */
  probedAt: number;
}

export interface IdentityMcpBindingRecord {
  serverKey: string;
  url: string;
  majorVersion: string;
  authenticationMode: 'CommercetoolsIdentity';
  /** Epoch ms; also the cache-key revision of the tool set. */
  connectedAt: number;
  discovery?: IdentityMcpDiscoveryRecord;
  client?: IdentityMcpClientRecord;
}

export interface Settings {
  schemaVersion: 1;
  systemPrompt: string;
  toolCallLogs: ToolCallLogsMode;
  identityMcp?: IdentityMcpBindingRecord;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  schemaVersion: 1,
  systemPrompt: '',
  toolCallLogs: 'all',
  updatedAt: 0,
}) as Settings;

export function settingsToValue(s: Settings): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...s, schemaVersion: 1 })) as Record<
    string,
    unknown
  >;
}

export function settingsFromValue(v: unknown): Settings {
  const o = isRecord(v) ? v : {};
  const mode = TOOL_CALL_LOG_MODES.find((m) => m === o.toolCallLogs);
  return {
    schemaVersion: 1,
    systemPrompt: typeof o.systemPrompt === 'string' ? o.systemPrompt : '',
    toolCallLogs: mode ?? 'all',
    identityMcp: isRecord(o.identityMcp)
      ? (o.identityMcp as unknown as IdentityMcpBindingRecord)
      : undefined,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
  };
}
