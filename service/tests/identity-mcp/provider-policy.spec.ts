/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { decryptJson } from '../../src/crypto/envelope';
import { createIdentityMcpAuthProvider } from '../../src/identity-mcp/auth-provider';
import type { IdentityAuthMode } from '../../src/identity-mcp/auth-provider';
import { stateKey } from '../../src/persistence';
import type { AuthStateRecord } from '../../src/identity-mcp/types';
import { captureLogs } from '../helpers/log-capture';
import {
  AUTH_STATE_CONTAINER,
  AS_ORIGIN,
  bindingFixture,
  CALLBACK,
  CONNECTED_AT,
  legacyClient,
  makeRig,
  MCP_URL,
  REGION,
  SCOPE,
  USER_ID,
} from './helpers';

const build = async (
  mode: IdentityAuthMode,
  loadedState?: AuthStateRecord,
  env = {}
) => {
  const rig = makeRig({ env });
  await rig.stores.binding.set(bindingFixture());
  const binding = (await rig.stores.binding.get())!;
  const provider = createIdentityMcpAuthProvider({
    config: rig.config,
    binding,
    userId: USER_ID,
    mode,
    loadedState,
    stores: rig.stores,
  });
  return { rig, provider };
};

describe('provider modes', () => {
  it('runtime: saveCodeVerifier is a no-op and redirectToAuthorization does not throw', async () => {
    const { provider } = await build('runtime');
    await provider.saveCodeVerifier('verifier');
    await expect(provider.codeVerifier()).rejects.toThrow(
      'No code verifier staged'
    );
    await expect(
      provider.redirectToAuthorization(new URL(`${AS_ORIGIN}/oauth2/auth?x=1`))
    ).resolves.toBeUndefined();
    expect(provider.capturedAuthorizationUrl).toBeUndefined();
    await expect(provider.persistPendingAttempt()).rejects.toThrow(
      /only valid on the authorize leg/
    );
  });

  it('callback: state() returns the loaded state, storedState never undefined, no restart', async () => {
    const loaded = {
      state: 'the-state',
      userId: USER_ID,
    } as unknown as AuthStateRecord;
    const { provider } = await build('callback', loaded);
    expect(await provider.state()).toBe('the-state');
    expect(await provider.storedState()).toBe('the-state');
    await expect(
      provider.redirectToAuthorization(new URL(AS_ORIGIN))
    ).rejects.toThrow(/restart authorization during a callback/);
    const without = (await build('callback')).provider;
    expect(await without.storedState()).toBe('');
    await expect(without.codeVerifier()).rejects.toThrow(/not claimed/);
  });

  it('authorize: state is 43 base64url characters and unique', async () => {
    const { provider } = await build('authorize');
    const a = await provider.state();
    const b = await provider.state();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('client metadata carries the derived redirect, scope and no secrets', async () => {
    const { provider } = await build('authorize');
    expect(provider.redirectUrl).toBe(CALLBACK);
    expect(provider.clientMetadata.redirect_uris).toEqual([CALLBACK]);
    expect(provider.clientMetadata.scope).toBe(SCOPE);
    expect(provider.clientMetadata.client_name).toBe(
      'commercetools AI Assistant'
    );
  });
});

describe('authorization-server policy', () => {
  it('accepts this region auth2 without noise', async () => {
    const { provider } = await build('authorize');
    const logs = captureLogs();
    await expect(
      provider.validateAuthorizationServerURL(MCP_URL, AS_ORIGIN)
    ).resolves.toBeUndefined();
    expect(logs.lines.join('')).not.toContain('AS_SELECTED');
    logs.stop();
  });

  it.each([
    'https://evil.example',
    'https://auth2.us-central1.gcp.commercetools.com.evil.example',
  ])('refuses a foreign host %s', async (host) => {
    const { provider } = await build('authorize');
    await expect(
      provider.validateAuthorizationServerURL(MCP_URL, host)
    ).rejects.toThrow('Refusing authorization server');
  });

  it('refuses another region and the client-credentials host', async () => {
    const { provider } = await build('authorize');
    await expect(
      provider.validateAuthorizationServerURL(
        MCP_URL,
        'https://auth2.europe-west1.gcp.commercetools.com'
      )
    ).rejects.toThrow('expected');
    await expect(
      provider.validateAuthorizationServerURL(
        MCP_URL,
        `https://auth.${REGION}.commercetools.com`
      )
    ).rejects.toThrow('Refusing authorization server');
  });

  it('a resource mismatch is logged and the derived URL is used', async () => {
    const { provider } = await build('authorize');
    const logs = captureLogs();
    const url = await provider.validateResourceURL(
      MCP_URL,
      'https://other.example/x'
    );
    expect(url?.href).toBe(MCP_URL);
    expect(logs.lines.join('')).toContain('RESOURCE_MISMATCH');
    logs.stop();
    expect((await provider.validateResourceURL(MCP_URL, MCP_URL))?.href).toBe(
      MCP_URL
    );
    expect((await provider.validateResourceURL(MCP_URL))?.href).toBe(MCP_URL);
  });
});

describe('persisting the attempt', () => {
  it('an incomplete attempt throws and writes nothing', async () => {
    const { provider, rig } = await build('authorize');
    await provider.state();
    await expect(provider.persistPendingAttempt()).rejects.toThrow(
      'Incomplete authorization attempt'
    );
    expect(
      await rig.persistence.gateway.query(AUTH_STATE_CONTAINER, { limit: 10 })
    ).toMatchObject({
      results: [],
    });
  });

  it('writes ONE record with an encrypted verifier and a 10 minute expiry', async () => {
    const { provider, rig } = await build('authorize');
    const state = await provider.state();
    await provider.saveCodeVerifier('plain-verifier-value');
    const before = Date.now();
    expect(await provider.persistPendingAttempt()).toBe(state);

    const page = await rig.persistence.gateway.query(AUTH_STATE_CONTAINER, {
      limit: 10,
    });
    expect(page.results).toHaveLength(1);
    expect(JSON.stringify(page.results[0].value)).not.toContain(
      'plain-verifier-value'
    );

    const claim = await rig.stores.authStates.claim(state);
    if (claim.outcome !== 'claimed')
      throw new Error('expected a claimed record');
    expect(claim.record.bindingConnectedAt).toBe(CONNECTED_AT);
    expect(claim.record.expiresAt - claim.record.createdAt).toBe(10 * 60_000);
    expect(claim.record.createdAt).toBeGreaterThanOrEqual(before);
    expect(
      decryptJson<{ codeVerifier: string }>(
        'identity-verifier',
        claim.record.encryptedVerifier,
        stateKey(state)
      ).codeVerifier
    ).toBe('plain-verifier-value');
  });

  it('the callback provider reads the verifier of the claimed attempt', async () => {
    const authorize = await build('authorize');
    const state = await authorize.provider.state();
    await authorize.provider.saveCodeVerifier('v-123');
    await authorize.provider.persistPendingAttempt();
    const claim = await authorize.rig.stores.authStates.claim(state);
    if (claim.outcome !== 'claimed')
      throw new Error('expected a claimed record');

    const callback = createIdentityMcpAuthProvider({
      config: authorize.rig.config,
      binding: (await authorize.rig.stores.binding.get())!,
      userId: USER_ID,
      mode: 'callback',
      loadedState: claim.record,
      stores: authorize.rig.stores,
    });
    expect(await callback.codeVerifier()).toBe('v-123');
  });
});

describe('client registration lifecycle', () => {
  const withClient = async (env = {}) => {
    const rig = makeRig({ env });
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    const provider = createIdentityMcpAuthProvider({
      config: rig.config,
      binding: (await rig.stores.binding.get())!,
      userId: USER_ID,
      mode: 'authorize',
      stores: rig.stores,
    });
    return { rig, provider };
  };

  it('a stored client is returned without the embedded authorization-server pin', async () => {
    const { provider } = await withClient();
    const info = (await provider.clientInformation()) as Record<
      string,
      unknown
    >;
    expect(info.client_id).toBe('client-abc');
    expect(info.issuer).toBeUndefined();
    expect(info.authorization_server).toBeUndefined();
    expect(info.token_endpoint).toBeUndefined();
  });

  it('a different deployment URL discards the stored client', async () => {
    const { provider } = await withClient({
      CONNECT_SERVICE_URL: 'https://other-deployment.example',
    });
    expect(await provider.clientInformation()).toBeUndefined();
  });

  it('authorizationServerInformation never pins the issuer', async () => {
    const { provider } = await withClient();
    const info = await provider.authorizationServerInformation();
    expect(info).toEqual({
      authorizationServerUrl: AS_ORIGIN,
      tokenEndpoint: `${AS_ORIGIN}/oauth2/token`,
    });
    expect(info && 'issuer' in info).toBe(false);
  });

  it('saveClientInformation stores the client encrypted with the redirect and scope', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    const provider = createIdentityMcpAuthProvider({
      config: rig.config,
      binding: (await rig.stores.binding.get())!,
      userId: USER_ID,
      mode: 'authorize',
      stores: rig.stores,
    });
    await provider.saveClientInformation({
      client_id: 'registered-1234567',
      client_secret: 'sssh',
    });
    const stored = (await rig.stores.binding.get())!.client!;
    expect(stored.clientIdPrefix).toBe('regist');
    expect(stored.redirectUri).toBe(CALLBACK);
    expect(stored.registeredScope).toBe(SCOPE);
    expect(JSON.stringify(stored)).not.toContain('sssh');
    expect(
      ((await provider.clientInformation()) as Record<string, unknown>)
        .client_id
    ).toBe('registered-1234567');
  });
});
