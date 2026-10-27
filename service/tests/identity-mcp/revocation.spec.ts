/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { encryptJson } from '../../src/crypto/envelope';
import {
  revokeRefreshToken,
  revokeStoredTokens,
} from '../../src/identity-mcp/revocation';
import { captureLogs } from '../helpers/log-capture';
import {
  AS_ORIGIN,
  bindingFixture,
  fakeAuth2,
  legacyClient,
  makeRig,
  REGION,
  tokenRecordFixture,
} from './helpers';

describe('revokeRefreshToken', () => {
  it('posts token, hint and client id to the revocation endpoint', async () => {
    const fake = fakeAuth2();
    await revokeRefreshToken({
      apiRegion: REGION,
      clientId: 'client-abc',
      refreshToken: 'refresh-1',
      fetchFn: fake.fetchFn,
    });
    expect(fake.revocations).toHaveLength(1);
    expect(fake.revocations[0].get('token')).toBe('refresh-1');
    expect(fake.revocations[0].get('token_type_hint')).toBe('refresh_token');
    expect(fake.revocations[0].get('client_id')).toBe('client-abc');
  });

  it('a network error returns without throwing and never logs the token', async () => {
    const logs = captureLogs();
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(
      revokeRefreshToken({
        apiRegion: REGION,
        clientId: 'c',
        refreshToken: String('super-secret-refresh'),
        fetchFn: failing,
      })
    ).resolves.toBeUndefined();
    const text = logs.lines.join('');
    expect(text).toContain('REVOKE_FAILED');
    expect(text).not.toContain('super-secret-refresh');
    logs.stop();
  });

  it('never sends the token to a revocation endpoint outside the auth2 origin', async () => {
    const calls: string[] = [];
    const fetchFn = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('well-known')) {
        return new Response(
          JSON.stringify({
            revocation_endpoint: 'https://evil.example/revoke',
          }),
          {
            status: 200,
          }
        );
      }
      return new Response('', { status: 200 });
    }) as typeof fetch;
    await revokeRefreshToken({
      apiRegion: REGION,
      clientId: 'c',
      refreshToken: 'r',
      fetchFn,
    });
    expect(calls.every((c) => !c.includes('evil.example'))).toBe(true);
  });

  it('a non-2xx revocation answer is only logged', async () => {
    const fetchFn = (async (input: string | URL | Request) =>
      String(input).includes('well-known')
        ? new Response(
            JSON.stringify({
              revocation_endpoint: `${AS_ORIGIN}/oauth2/revoke`,
            }),
            { status: 200 }
          )
        : new Response('nope', { status: 500 })) as typeof fetch;
    await expect(
      revokeRefreshToken({
        apiRegion: REGION,
        clientId: 'c',
        refreshToken: 'r',
        fetchFn,
      })
    ).resolves.toBeUndefined();
  });
});

describe('revokeStoredTokens', () => {
  it('decrypts the stored refresh token and client id and revokes', async () => {
    const rig = makeRig();
    const binding = bindingFixture({ client: legacyClient() });
    const fake = fakeAuth2();
    await revokeStoredTokens(
      rig.config,
      binding,
      tokenRecordFixture(),
      fake.fetchFn
    );
    expect(fake.revocations).toHaveLength(1);
    expect(fake.revocations[0].get('token')).toBe('refresh-1');
    expect(fake.revocations[0].get('client_id')).toBe('client-abc');
  });

  it('does nothing without a refresh token or a stored client, and swallows unreadable data', async () => {
    const rig = makeRig();
    const fake = fakeAuth2();
    await revokeStoredTokens(
      rig.config,
      bindingFixture({ client: legacyClient() }),
      tokenRecordFixture({ hasRefreshToken: false }),
      fake.fetchFn
    );
    await revokeStoredTokens(
      rig.config,
      bindingFixture(),
      tokenRecordFixture(),
      fake.fetchFn
    );
    const broken = tokenRecordFixture({
      encryptedTokens: encryptJson('identity-tokens', { x: 1 }, 'other-user'),
    });
    await expect(
      revokeStoredTokens(
        rig.config,
        bindingFixture({ client: legacyClient() }),
        broken,
        fake.fetchFn
      )
    ).resolves.toBeUndefined();
    expect(fake.revocations).toHaveLength(0);
  });
});
