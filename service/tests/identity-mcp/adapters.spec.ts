/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { encryptJson } from '../../src/crypto/envelope';
import { stateKey } from '../../src/persistence';
import {
  bindingFixture,
  CONNECTED_AT,
  legacyClient,
  makeRig,
  tokenRecordFixture,
  USER_ID,
} from './helpers';

describe('identity adapters over the persistence layer', () => {
  it('claim twice: the second claim is unknown', async () => {
    const { stores } = makeRig();
    const now = Date.now();
    await stores.authStates.create({
      state: 'state-1',
      userId: USER_ID,
      encryptedVerifier: encryptJson(
        'identity-verifier',
        { codeVerifier: 'v' },
        stateKey('state-1')
      ),
      redirectUri: 'https://x/cb',
      bindingConnectedAt: CONNECTED_AT,
      createdAt: now,
      expiresAt: now + 60_000,
    });
    const first = await stores.authStates.claim('state-1');
    expect(first.outcome).toBe('claimed');
    expect((await stores.authStates.claim('state-1')).outcome).toBe('unknown');
  });

  it('a stale issuedAt is ignored', async () => {
    const { stores } = makeRig();
    expect(
      await stores.tokens.put(tokenRecordFixture({ issuedAt: 2000 }))
    ).toBe('written');
    expect(
      await stores.tokens.put(tokenRecordFixture({ issuedAt: 1000 }))
    ).toBe('stale-ignored');
    expect((await stores.tokens.get(USER_ID))?.record.issuedAt).toBe(2000);
  });

  it('deleteIfVersion with an old version conflicts and keeps the record', async () => {
    const { stores } = makeRig();
    await stores.tokens.put(tokenRecordFixture({ issuedAt: 1000 }));
    const before = await stores.tokens.get(USER_ID);
    await stores.tokens.put(tokenRecordFixture({ issuedAt: 2000 }));
    expect(await stores.tokens.deleteIfVersion(USER_ID, before!.version)).toBe(
      'conflict'
    );
    expect(await stores.tokens.get(USER_ID)).not.toBeNull();

    const current = await stores.tokens.get(USER_ID);
    expect(await stores.tokens.deleteIfVersion(USER_ID, current!.version)).toBe(
      'deleted'
    );
    expect(await stores.tokens.deleteIfVersion(USER_ID, current!.version)).toBe(
      'absent'
    );
  });

  it('deleteAll returns the count, empties the container and visits every record', async () => {
    const { stores } = makeRig();
    for (const id of ['u1', 'u2', 'u3']) {
      await stores.tokens.put(tokenRecordFixture({ userId: id }));
    }
    const seen: string[] = [];
    const count = await stores.tokens.deleteAll(async (r) => {
      seen.push(r.userId);
    });
    expect(count).toBe(3);
    expect(seen.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(await stores.tokens.get('u1')).toBeNull();
  });

  it('a failing beforeDelete does not stop the deletion', async () => {
    const { stores } = makeRig();
    await stores.tokens.put(tokenRecordFixture({ userId: 'u1' }));
    const count = await stores.tokens.deleteAll(async () => {
      throw new Error('revocation down');
    });
    expect(count).toBe(1);
  });

  it('setClient keeps connectedAt and discovery; null removes only the client', async () => {
    const { stores } = makeRig();
    const discovery = { authorizationServers: ['https://a'], probedAt: 5 };
    await stores.binding.set(bindingFixture({ discovery }));
    await stores.binding.setClient(legacyClient());

    const withClient = await stores.binding.get();
    expect(withClient?.connectedAt).toBe(CONNECTED_AT);
    expect(withClient?.discovery).toEqual(discovery);
    expect(withClient?.client?.clientIdPrefix).toBe('client');

    await stores.binding.setClient(null);
    const without = await stores.binding.get();
    expect(without?.client).toBeUndefined();
    expect(without?.discovery).toEqual(discovery);
  });

  it('set drops the previous client; clear removes the binding; setClient without binding is a no-op', async () => {
    const { stores } = makeRig();
    await stores.binding.setClient(legacyClient());
    expect(await stores.binding.get()).toBeNull();

    await stores.binding.set(bindingFixture());
    await stores.binding.setClient(legacyClient());
    await stores.binding.set(bindingFixture({ connectedAt: CONNECTED_AT + 5 }));
    expect((await stores.binding.get())?.client).toBeUndefined();

    await stores.binding.clear();
    expect(await stores.binding.get()).toBeNull();
  });

  it('binding changes keep the other settings fields', async () => {
    const { stores, persistence } = makeRig();
    await persistence.settings.update((s) => ({
      ...s,
      systemPrompt: 'keep me',
    }));
    await stores.binding.set(bindingFixture());
    await stores.binding.clear();
    expect((await persistence.settings.get()).systemPrompt).toBe('keep me');
  });
});
