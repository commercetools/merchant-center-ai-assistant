/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { runWithContext } from '../../src/context/request-context';
import {
  setConnectedSourcesProvider,
  getConnectedSourcesProvider,
} from '../../src/services/connected-sources.provider';
import { setToolMenuProvider } from '../../src/services/tool-menu.provider';
import { installRegistryProviders } from '../../src/tool-sources/providers';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import {
  asUser,
  makeSessionApp,
  resetSessionApp,
  type TestApp,
} from '../helpers/session-app';
import { StubToolSource } from '../helpers/stub-tool-source';

let t: TestApp;
beforeEach(() => {
  t = makeSessionApp();
});
afterEach(() => {
  resetSessionApp();
  setToolMenuProvider({ listMenuGroups: async () => [] });
  setConnectedSourcesProvider({ list: async () => [] });
});

describe('registry providers (tool menu and connected sources)', () => {
  it('GET /session/:id/tools returns the stub group with the session switches applied', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'stub',
        menu: { toolNames: ['echo', 'ping'] },
      }),
      new StubToolSource({ name: 'hidden', menu: null })
    );
    installRegistryProviders(registry);

    const created = await request(t.app)
      .post('/service/session')
      .set(asUser('u1'))
      .send({});
    const id = created.body.data.id as string;
    await request(t.app)
      .put(`/service/session/${id}/tools`)
      .set(asUser('u1'))
      .send({
        tools: [{ mcp: 'stub', tools: [{ toolName: 'ping', enabled: false }] }],
      });

    const res = await request(t.app)
      .get(`/service/session/${id}/tools`)
      .set(asUser('u1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        mcp: 'stub',
        tools: [
          { toolName: 'echo', enabled: true },
          { toolName: 'ping', enabled: false },
        ],
      },
    ]);
  });

  it('an empty menu group is still returned', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'commercetools', menu: { toolNames: [] } })
    );
    installRegistryProviders(registry);
    const created = await request(t.app)
      .post('/service/session')
      .set(asUser('u1'))
      .send({});
    const res = await request(t.app)
      .get(`/service/session/${created.body.data.id}/tools`)
      .set(asUser('u1'));
    expect(res.body.data).toEqual([{ mcp: 'commercetools', tools: [] }]);
  });

  it('feeds the connected sources of the request user to the suggestions seam', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'stripe', kind: 'integration' }),
      new StubToolSource({
        name: 'algolia',
        kind: 'integration',
        enabled: false,
      })
    );
    installRegistryProviders(registry);
    const names = await runWithContext(
      {
        requestId: 'r',
        correlationId: 'c',
        user: { userId: 'u1', projectKey: 'p', isAdmin: false },
      },
      () => getConnectedSourcesProvider().list()
    );
    expect(names).toEqual(['stripe']);
  });

  it('answers no connected sources outside an authenticated request', async () => {
    installRegistryProviders(createToolSourceRegistry());
    expect(await getConnectedSourcesProvider().list()).toEqual([]);
  });
});
