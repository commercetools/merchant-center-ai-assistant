/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface NextPrompt {
  text: string;
  prompt: string;
}

/** Session feature flags; `customView` is the one the code reads. */
export interface FeatureFlags {
  customView?: string;
}

/** Tools the user turned OFF, keyed by tool group. */
export type DisabledTools = Record<string, string[]>;

export interface TemporaryTable {
  tableRef: string;
  toolName: string;
  args: string;
  columnNames?: string;
}

/**
 * A chat session. Dates are epoch milliseconds, never `Date` objects. Never use `null`
 * meaningfully: the platform does not store `null` members.
 */
export interface SessionRecord {
  id: string;
  /** Verified commercetools Identity user id (the owner). */
  userId: string;
  /** Display-only, client supplied; never used for authorisation, keys or filters. */
  userLabel?: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  description?: string;
  icon?: string;
  summary?: string;
  nextPrompts?: NextPrompt[];
  digestUpdatedAt?: number;
  featureFlags?: FeatureFlags;
  disabledTools?: DisabledTools;
  temporaryTables?: TemporaryTable[];
  metadata?: Record<string, unknown>;
  schemaVersion: 1;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const optString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;
const optNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Domain -> JSON-safe value (drops `undefined`; adds the schema version). */
export function sessionToValue(s: SessionRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...s, schemaVersion: 1 })) as Record<
    string,
    unknown
  >;
}

/** Stored value -> domain. Defaults missing optional fields, tolerates unknown fields. */
export function sessionFromValue(v: unknown): SessionRecord {
  const o = isRecord(v) ? v : {};
  const flags = isRecord(o.featureFlags) ? o.featureFlags : undefined;
  return {
    id: optString(o.id) ?? '',
    userId: optString(o.userId) ?? '',
    userLabel: optString(o.userLabel),
    createdAt: optNumber(o.createdAt) ?? 0,
    updatedAt: optNumber(o.updatedAt) ?? 0,
    title: optString(o.title),
    description: optString(o.description),
    icon: optString(o.icon),
    summary: optString(o.summary),
    nextPrompts: Array.isArray(o.nextPrompts)
      ? (o.nextPrompts as NextPrompt[])
      : undefined,
    digestUpdatedAt: optNumber(o.digestUpdatedAt),
    featureFlags: flags ? (flags as FeatureFlags) : undefined,
    disabledTools: isRecord(o.disabledTools)
      ? (o.disabledTools as DisabledTools)
      : undefined,
    temporaryTables: Array.isArray(o.temporaryTables)
      ? (o.temporaryTables as TemporaryTable[])
      : undefined,
    metadata: isRecord(o.metadata) ? o.metadata : undefined,
    schemaVersion: 1,
  };
}
