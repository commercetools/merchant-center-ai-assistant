/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createIdentityMcpAuthProvider } from '../../src/identity-mcp/auth-provider';
import type { IdentityAuthMode } from '../../src/identity-mcp/auth-provider';
import { captureLogs } from '../helpers/log-capture';
import {
  bindingFixture,
  CONNECTED_AT,
  makeRig,
  tokenRecordFixture,
  TOKEN_CONTAINER,
  USER_ID,
  type Rig,
} from './helpers';

const providerFor = async (rig: Rig, mode: IdentityAuthMode = 'runtime') =>
  createIdentityMcpAuthProvider({
    config: rig.config,
    binding: (await rig.stores.binding.get())!,
    userId: USER_ID,
    mode,
    stores: rig.stores,
  });

const newTokens = (refresh = 'refresh-new') => ({
  access_token: 'new-access',
  token_type: 'bearer',
  expires_in: 60,
  refresh_token: refresh,
});

describe('token storage and refresh-race protection', () => {
  it('a record from an older binding revision is deleted and not returned', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(
      tokenRecordFixture({ bindingConnectedAt: CONNECTED_AT - 1 })
    );
    const logs = captureLogs();

    const provider = await providerFor(rig);
    expect(await provider.tokens()).toBeUndefined();
    expect(await rig.stores.tokens.get(USER_ID)).toBeNull();
    expect(logs.lines.join('')).toContain('TOK_STALE_BINDING');
    logs.stop();
  });

  it('tokens() returns an expired token and reports hadNoToken correctly', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    const empty = await providerFor(rig);
    expect(await empty.tokens()).toBeUndefined();
    expect(empty.hadNoToken).toBe(true);

    await rig.stores.tokens.put(tokenRecordFixture());
    const provider = await providerFor(rig);
    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe('expired-access');
    expect(provider.hadNoToken).toBe(false);
  });

  it('provider B does not delete the record provider A just refreshed', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture({ issuedAt: 1000 }));
    const a = await providerFor(rig);
    const b = await providerFor(rig);
    await a.tokens();
    await b.tokens(); // B remembers the old version

    await a.saveTokens(newTokens('refresh-from-a')); // rotation on A
    const logs = captureLogs();
    await b.invalidateCredentials('tokens'); // B's refresh failed with the old token
    expect(logs.lines.join('')).toContain('INVALIDATE_SKIPPED_NEWER');
    logs.stop();

    const stored = await rig.stores.tokens.get(USER_ID);
    expect(stored).not.toBeNull();
    const fresh = await (await providerFor(rig)).tokens();
    expect(fresh?.refresh_token).toBe('refresh-from-a');
  });

  it('invalidate deletes the record when the version is unchanged', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture());
    const provider = await providerFor(rig);
    await provider.tokens();
    await provider.invalidateCredentials('tokens');
    expect(await rig.stores.tokens.get(USER_ID)).toBeNull();
  });

  it('invalidate without a prior read does not delete (runtime)', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture());
    const provider = await providerFor(rig);
    await provider.invalidateCredentials('all');
    expect(await rig.stores.tokens.get(USER_ID)).not.toBeNull();
  });

  it('invalidate(all) in the authorize leg deletes without a read', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture());
    const provider = await providerFor(rig, 'authorize');
    await provider.invalidateCredentials('all');
    expect(await rig.stores.tokens.get(USER_ID)).toBeNull();
  });

  it('saveTokens with an older issuedAt than the stored one is ignored and logged', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    const future = Date.now() + 3_600_000;
    await rig.stores.tokens.put(tokenRecordFixture({ issuedAt: future }));
    const logs = captureLogs();

    await (await providerFor(rig)).saveTokens(newTokens());
    expect(logs.lines.join('')).toContain('TOK_STALE_IGNORED');
    logs.stop();
    expect((await rig.stores.tokens.get(USER_ID))?.record.issuedAt).toBe(
      future
    );
  });

  it('saved tokens are encrypted: no secret appears in the stored value', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    await (
      await providerFor(rig)
    ).saveTokens({
      ...newTokens('very-secret-refresh'),
      id_token: 'very-secret-id',
    });
    const raw = JSON.stringify(
      await rig.persistence.gateway.get(TOKEN_CONTAINER, USER_ID)
    );
    for (const secret of [
      'new-access',
      'very-secret-refresh',
      'very-secret-id',
    ]) {
      expect(raw).not.toContain(secret);
    }
    const stored = (await rig.stores.tokens.get(USER_ID))!.record;
    expect(stored.hasRefreshToken).toBe(true);
    expect(stored.bindingConnectedAt).toBe(CONNECTED_AT);
  });

  it('a record encrypted for another user cannot be read (aad binding)', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    const foreign = tokenRecordFixture({ userId: 'someone-else' });
    // Copy the blob of "someone-else" onto this user's record.
    await rig.stores.tokens.put({ ...foreign, userId: USER_ID });
    const logs = captureLogs();
    expect(await (await providerFor(rig)).tokens()).toBeUndefined();
    expect(logs.lines.join('')).toContain('TOK_UNREADABLE');
    logs.stop();
    // Not deleted: a wrong key must not destroy consent.
    expect(await rig.stores.tokens.get(USER_ID)).not.toBeNull();
  });
});
