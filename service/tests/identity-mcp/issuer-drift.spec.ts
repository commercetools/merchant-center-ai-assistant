/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { auth } from '@ai-sdk/mcp';
import { decryptJson } from '../../src/crypto/envelope';
import { createIdentityMcpAuthProvider } from '../../src/identity-mcp/auth-provider';
import type { IdentityAuthMode } from '../../src/identity-mcp/auth-provider';
import {
  AS_ORIGIN,
  bindingFixture,
  fakeAuth2,
  legacyClient,
  makeRig,
  MCP_URL,
  tokenRecordFixture,
  USER_ID,
} from './helpers';

/**
 * Identity OAuth must survive the authorization server re-spelling its issuer.
 *
 * A measured regression: on 2026-09-30 auth2 dropped the trailing slash from its metadata
 * `issuer` in every region. `@ai-sdk/mcp` embeds the issuer it saw in every client and token
 * set it saves and compares it as an exact string, so every pre-existing record failed with
 * "metadata does not match the metadata that issued the stored credentials" - on the chat
 * path AND on the authorize leg. These tests drive the real SDK `auth()` against a fake auth2,
 * seeded with records shaped exactly like the ones written before the change. Only the
 * persistence is in memory. This test is the canary for `@ai-sdk/mcp` upgrades.
 */

async function seeded(mode: IdentityAuthMode, withToken: boolean) {
  const rig = makeRig();
  await rig.stores.binding.set(bindingFixture());
  await rig.stores.binding.setClient(legacyClient());
  if (withToken) await rig.stores.tokens.put(tokenRecordFixture());
  const binding = (await rig.stores.binding.get())!;
  const provider = createIdentityMcpAuthProvider({
    config: rig.config,
    binding,
    userId: USER_ID,
    mode,
    stores: rig.stores,
  });
  return { rig, provider };
}

describe('identity OAuth after auth2 re-spelled its issuer', () => {
  it('refreshes a legacy token set instead of failing the metadata check', async () => {
    const { rig, provider } = await seeded('runtime', true);
    const { fetchFn, tokenRequests } = fakeAuth2();

    await expect(auth(provider, { serverUrl: MCP_URL, fetchFn })).resolves.toBe(
      'AUTHORIZED'
    );

    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].get('grant_type')).toBe('refresh_token');
    expect(tokenRequests[0].get('refresh_token')).toBe('refresh-1');

    const stored = await rig.stores.tokens.get(USER_ID);
    expect(stored).not.toBeNull();
    const plain = decryptJson<{ access_token: string }>(
      'identity-tokens',
      stored!.record.encryptedTokens,
      USER_ID
    );
    expect(plain.access_token).toBe('fresh-access');
  });

  it('lets a user with a legacy client start a new authorization', async () => {
    const { provider } = await seeded('authorize', false);
    const { fetchFn } = fakeAuth2();

    await expect(auth(provider, { serverUrl: MCP_URL, fetchFn })).resolves.toBe(
      'REDIRECT'
    );

    const url = provider.capturedAuthorizationUrl;
    expect(url?.origin).toBe(AS_ORIGIN);
    expect(url?.pathname).toBe('/oauth2/auth');
    expect(url?.searchParams.get('client_id')).toBe('client-abc');
  });

  it('still refuses stored credentials when the token endpoint moved', async () => {
    const { provider } = await seeded('runtime', true);
    const { fetchFn, tokenRequests } = fakeAuth2({
      tokenEndpoint: `${AS_ORIGIN}/oauth2/v2/token`,
    });

    await expect(
      auth(provider, { serverUrl: MCP_URL, fetchFn })
    ).rejects.toThrow(
      'does not match the metadata that issued the stored credentials'
    );
    expect(tokenRequests).toHaveLength(0);
  });
});
