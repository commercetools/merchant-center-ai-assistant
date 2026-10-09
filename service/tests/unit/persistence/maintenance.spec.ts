/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import { decryptJson, encryptJson } from '../../../src/crypto/envelope';
import { KeyRing } from '../../../src/crypto/keys';
import { stateKey } from '../../../src/persistence';
import {
  IDENTITY_CLIENT_AAD,
  purgeContainers,
  reencryptAll,
} from '../../../src/persistence/maintenance';
import { createPersistence } from '../../../src/persistence';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';
import { freshConfig } from '../../helpers/env';
import { session } from '../../helpers/persistence';

describe('purgeContainers', () => {
  it('removes everything under a test prefix and nothing else', async () => {
    const gw = new MemoryObjectGateway();
    const prefix = 'ai-assistant-it-abc';
    const test = createPersistence(freshConfig(), { gateway: gw, containerPrefix: prefix });
    const real = createPersistence(freshConfig(), { gateway: gw });
    await test.sessions.create(session('s1', 'u'));
    await test.messages.put('s1', [{ id: 'm', role: 'user', parts: [] }]);
    await test.settings.update((s) => ({ ...s, systemPrompt: 'x' }));
    await real.sessions.create(session('keep', 'u'));
    const r = await purgeContainers(gw, { prefix });
    expect(r.objects).toBe(3);
    expect(gw.containerNames()).toEqual(['ai-assistant-sessions']);
  });

  it('refuses an empty prefix and a non-test prefix without the override', async () => {
    const gw = new MemoryObjectGateway();
    await expect(purgeContainers(gw, { prefix: '' })).rejects.toThrow(/prefix/);
    await expect(purgeContainers(gw, { prefix: 'ai-assistant' })).rejects.toThrow(/Refusing/);
    await expect(
      purgeContainers(gw, { prefix: 'ai-assistant', allowAnyPrefix: true })
    ).resolves.toBeDefined();
  });
});

describe('reencryptAll', () => {
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);
  const old: KeyRing = { primary: k1, previous: [] };
  const rotated: KeyRing = { primary: k2, previous: [k1] };

  async function seed(gw: MemoryObjectGateway) {
    const p = createPersistence(freshConfig(), { gateway: gw });
    await p.tokens.putTokens({
      userId: 'u1',
      serverKey: 'sk',
      encryptedTokens: encryptJson('identity-tokens', { access_token: 'AT' }, 'u1', old),
      hasRefreshToken: true,
      issuedAt: 1,
      updatedAt: 1,
    });
    await p.tokens.createAuthState({
      state: 'st',
      userId: 'u1',
      encryptedVerifier: encryptJson('identity-verifier', 'ver', stateKey('st'), old),
      redirectUri: 'https://x.example.test',
      createdAt: Date.now(),
      expiresAt: Date.now() + 100000,
    });
    await p.settings.update((s) => ({
      ...s,
      identityMcp: {
        serverKey: 'sk',
        url: 'https://mcp.example.test',
        majorVersion: '1',
        authenticationMode: 'CommercetoolsIdentity',
        connectedAt: 1,
        client: {
          encryptedClient: encryptJson('identity-client', { client_id: 'c' }, IDENTITY_CLIENT_AAD, old),
          clientIdPrefix: 'c',
          redirectUri: 'https://x.example.test',
          registeredAt: 1,
        },
      },
    }));
    return p;
  }

  it('re-encrypts everything with the primary key and is re-runnable', async () => {
    const gw = new MemoryObjectGateway();
    const p = await seed(gw);
    const dry = await reencryptAll(gw, rotated, { dryRun: true });
    expect(dry).toEqual({ tokens: 1, authStates: 1, settings: 1, failed: 0 });
    expect((await p.tokens.getTokens('u1'))?.encryptedTokens.kid).not.toBe(
      encryptJson('identity-tokens', 1, 'x', rotated).kid
    );

    const done = await reencryptAll(gw, rotated);
    expect(done).toEqual({ tokens: 1, authStates: 1, settings: 1, failed: 0 });
    const onlyNew: KeyRing = { primary: k2, previous: [] };
    const rec = await p.tokens.getTokens('u1');
    expect(decryptJson('identity-tokens', rec?.encryptedTokens, 'u1', onlyNew)).toEqual({
      access_token: 'AT',
    });
    const claimed = await p.tokens.claimAuthState('st');
    expect(claimed.outcome).toBe('claimed');
    if (claimed.outcome === 'claimed') {
      expect(decryptJson('identity-verifier', claimed.record.encryptedVerifier, stateKey('st'), onlyNew)).toBe('ver');
    }
    const settings = await createPersistence(freshConfig({ SETTINGS_CACHE_TTL_MS: '0' }), { gateway: gw }).settings.get();
    expect(
      decryptJson('identity-client', settings.identityMcp?.client?.encryptedClient, IDENTITY_CLIENT_AAD, onlyNew)
    ).toEqual({ client_id: 'c' });

    expect(await reencryptAll(gw, rotated)).toEqual({ tokens: 0, authStates: 0, settings: 0, failed: 0 });
  });

  it('counts failures instead of throwing or leaking values', async () => {
    const gw = new MemoryObjectGateway();
    await seed(gw);
    const wrongKeys: KeyRing = { primary: randomBytes(32), previous: [] };
    const r = await reencryptAll(gw, wrongKeys);
    expect(r.failed).toBe(3);
    expect(r.tokens + r.authStates + r.settings).toBe(0);
  });
});
