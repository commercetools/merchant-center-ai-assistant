/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { IDENTITY_CLIENT_AAD, identityTokensAad } from '../crypto/aad';
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

/** aad of the project's OAuth client envelope in the settings object. */
export { IDENTITY_CLIENT_AAD };

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

export interface ReencryptResult {
  tokens: number;
  authStates: number;
  settings: number;
  failed: number;
}

function needsRotation(env: Envelope | undefined, keys: KeyRing): boolean {
  return !!env && env.kid !== kidOf(keys.primary);
}

async function rotateOne<V extends Record<string, unknown>>(
  gw: ObjectGateway,
  keys: KeyRing,
  dryRun: boolean | undefined,
  result: ReencryptResult,
  container: string,
  key: string,
  pick: (v: V) => Envelope | undefined,
  swap: (v: V) => V,
  counter: 'tokens' | 'authStates' | 'settings'
): Promise<void> {
  try {
    const cur = await gw.get(container, key);
    if (!cur || !isRecord(cur.value) || !needsRotation(pick(cur.value as V), keys)) return;
    if (dryRun) {
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

  const rotate = <V extends Record<string, unknown>>(
    container: string,
    key: string,
    pick: (v: V) => Envelope | undefined,
    swap: (v: V) => V,
    counter: 'tokens' | 'authStates' | 'settings'
  ): Promise<void> => rotateOne<V>(gw, keys, o.dryRun, result, container, key, pick, swap, counter);

  for (const key of await allKeys(gw, c.tokens())) {
    await rotate<Record<string, unknown>>(
      c.tokens(),
      key,
      (v) => (v as unknown as IdentityTokenRecord).encryptedTokens,
      (v) => {
        const rec = v as unknown as IdentityTokenRecord;
        const plain = decryptJson('identity-tokens', rec.encryptedTokens, identityTokensAad(rec.userId), keys);
        return {
          ...v,
          encryptedTokens: encryptJson('identity-tokens', plain, identityTokensAad(rec.userId), keys),
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
