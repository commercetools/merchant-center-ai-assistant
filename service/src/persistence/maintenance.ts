/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { decryptJson, encryptJson, Envelope } from '../crypto/envelope';
import { kidOf, KeyRing } from '../crypto/keys';
import { updateWithRetry, SKIP } from './gateway/cas';
import { mapBounded } from './gateway/concurrency';
import type { ObjectGateway } from './gateway/types';
import { PAGE } from './limits';
import { containers } from './names';
import type { IdentityTokenRecord } from './types/identity';
import { isRecord } from './types/session';
import { settingsFromValue } from './types/settings';

/** aad of the project's OAuth client envelope in the settings object (see change I). */
export const IDENTITY_CLIENT_AAD = 'default';

export const TEST_PREFIX = 'ai-assistant-it-';

export interface PurgeOptions {
  prefix: string;
  concurrency?: number;
  /** Allows prefixes other than `ai-assistant-it-...` (deletes real data). */
  allowAnyPrefix?: boolean;
}

/** Lists every key of a container (offset paging, ordered by key). */
async function allKeys(gw: ObjectGateway, container: string): Promise<string[]> {
  const keys: string[] = [];
  for (let offset = 0; offset <= 10000; offset += PAGE) {
    const page = await gw.query(container, {
      sort: { field: 'key', dir: 'asc' },
      limit: PAGE,
      offset,
    });
    keys.push(...page.results.map((r) => r.key));
    if (page.results.length < PAGE) break;
  }
  return keys;
}

async function emptyContainer(
  gw: ObjectGateway,
  container: string,
  concurrency: number
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await gw.query(container, {
      sort: { field: 'key', dir: 'asc' },
      limit: PAGE,
    });
    if (page.results.length === 0) return deleted;
    const done = await mapBounded(page.results, concurrency, (r) =>
      gw.delete(container, r.key)
    );
    deleted += done.filter((d) => d !== null).length;
  }
}

/**
 * Deletes everything the connector wrote under `prefix`. Per-session and per-feedback
 * containers are discovered from the sessions and feedback containers, so containers whose
 * parent object is already gone cannot be found (documented limitation).
 */
export async function purgeContainers(
  gw: ObjectGateway,
  o: PurgeOptions
): Promise<{ containers: number; objects: number }> {
  if (!o.prefix || o.prefix.trim() === '') throw new Error('A prefix is required');
  if (!o.allowAnyPrefix && !o.prefix.startsWith(TEST_PREFIX)) {
    throw new Error(`Refusing to purge a prefix that does not start with ${TEST_PREFIX}`);
  }
  const concurrency = o.concurrency ?? 8;
  const c = containers(o.prefix);
  const names = [
    ...(await allKeys(gw, c.sessions())).map((id) => c.messages(id)),
    ...(await allKeys(gw, c.feedback())).map((id) => c.feedbackSnap(id)),
    c.sessions(),
    c.feedback(),
    c.settings(),
    c.tokens(),
    c.states(),
    c.suggestions(),
  ];
  let objects = 0;
  for (const name of names) objects += await emptyContainer(gw, name, concurrency);
  return { containers: names.length, objects };
}

export interface ReencryptResult {
  tokens: number;
  authStates: number;
  settings: number;
  failed: number;
}

function needsRotation(env: Envelope | undefined, keys: KeyRing): boolean {
  return !!env && env.kid !== kidOf(keys.primary);
}

/**
 * Re-encrypts every stored envelope with the primary key. Safe to re-run; counts only,
 * never values. With `dryRun` nothing is written.
 */
export async function reencryptAll(
  gw: ObjectGateway,
  keys: KeyRing,
  o: { prefix?: string; dryRun?: boolean; concurrency?: number } = {}
): Promise<ReencryptResult> {
  const c = containers(o.prefix);
  const result: ReencryptResult = { tokens: 0, authStates: 0, settings: 0, failed: 0 };
  const concurrency = o.concurrency ?? 8;

  const rotate = async <V extends Record<string, unknown>>(
    container: string,
    key: string,
    pick: (v: V) => Envelope | undefined,
    swap: (v: V) => V,
    counter: 'tokens' | 'authStates' | 'settings'
  ): Promise<void> => {
    try {
      const cur = await gw.get(container, key);
      if (!cur || !isRecord(cur.value) || !needsRotation(pick(cur.value as V), keys)) return;
      if (o.dryRun) {
        result[counter] += 1;
        return;
      }
      const r = await updateWithRetry<V>(gw, container, key, (v) =>
        v && needsRotation(pick(v), keys) ? swap(v) : SKIP
      );
      if (r.written) result[counter] += 1;
    } catch {
      result.failed += 1;
    }
  };

  for (const key of await allKeys(gw, c.tokens())) {
    await rotate<Record<string, unknown>>(
      c.tokens(),
      key,
      (v) => (v as unknown as IdentityTokenRecord).encryptedTokens,
      (v) => {
        const rec = v as unknown as IdentityTokenRecord;
        const plain = decryptJson('identity-tokens', rec.encryptedTokens, rec.userId, keys);
        return {
          ...v,
          encryptedTokens: encryptJson('identity-tokens', plain, rec.userId, keys),
        };
      },
      'tokens'
    );
  }
  const stateKeys = await allKeys(gw, c.states());
  await mapBounded(stateKeys, concurrency, (key) =>
    rotate<Record<string, unknown>>(
      c.states(),
      key,
      (v) => v.encryptedVerifier as Envelope | undefined,
      (v) => {
        const plain = decryptJson('identity-verifier', v.encryptedVerifier as Envelope, key, keys);
        return { ...v, encryptedVerifier: encryptJson('identity-verifier', plain, key, keys) };
      },
      'authStates'
    )
  );
  await rotate<Record<string, unknown>>(
    c.settings(),
    'default',
    (v) => settingsFromValue(v).identityMcp?.client?.encryptedClient,
    (v) => {
      const s = settingsFromValue(v);
      const client = s.identityMcp?.client;
      if (!s.identityMcp || !client) return v;
      const plain = decryptJson('identity-client', client.encryptedClient, IDENTITY_CLIENT_AAD, keys);
      return {
        ...v,
        identityMcp: {
          ...s.identityMcp,
          client: {
            ...client,
            encryptedClient: encryptJson('identity-client', plain, IDENTITY_CLIENT_AAD, keys),
          },
        },
      };
    },
    'settings'
  );
  return result;
}
