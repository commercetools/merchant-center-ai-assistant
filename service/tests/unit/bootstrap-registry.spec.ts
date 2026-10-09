/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  registerBootstrapContributor,
  resetBootstrapContributorsForTests,
  runContributors,
} from '../../src/auth/bootstrap-registry';
import type { AuthenticatedRequest } from '../../src/types/request.types';

const req = {
  user: { userId: 'u', projectKey: 'p', isAdmin: false },
} as unknown as AuthenticatedRequest;

beforeEach(() => resetBootstrapContributorsForTests());

describe('bootstrap contributor registry', () => {
  it('merges the results of all contributors', async () => {
    registerBootstrapContributor('a', async () => ({ toolCallLogs: 'all' }));
    registerBootstrapContributor('b', async () => ({ workspace: 'w' }));
    expect(await runContributors(req)).toEqual({ toolCallLogs: 'all', workspace: 'w' });
  });

  it('omits the keys of a failing contributor', async () => {
    registerBootstrapContributor('ok', async () => ({ x: 1 }));
    registerBootstrapContributor('bad', async () => {
      throw new Error('boom');
    });
    expect(await runContributors(req)).toEqual({ x: 1 });
  });

  it('throws on a key collision', async () => {
    registerBootstrapContributor('a', async () => ({ k: 1 }));
    registerBootstrapContributor('b', async () => ({ k: 2 }));
    await expect(runContributors(req)).rejects.toThrow('bootstrap key collision: k');
  });

  it.each(['projectKey', 'userId', 'isAdmin'])('reserves the core key %s', async (key) => {
    registerBootstrapContributor('a', async () => ({ [key]: 'x' }));
    await expect(runContributors(req)).rejects.toThrow('bootstrap key collision');
  });

  it('throws on a duplicate name', () => {
    registerBootstrapContributor('a', async () => ({}));
    expect(() => registerBootstrapContributor('a', async () => ({}))).toThrow(
      'already registered: a'
    );
  });
});
