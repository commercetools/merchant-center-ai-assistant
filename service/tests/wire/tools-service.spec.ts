/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import {
  setToolMenuProvider,
  type ToolMenuProvider,
} from '../../src/services/tool-menu.provider';
import {
  disabledNamesFor,
  filterEnabled,
  toSessionTools,
} from '../../src/services/tools.service';
import { asUser, makeSessionApp, resetSessionApp } from '../helpers/session-app';

const A = asUser('user-a');

const provider = (groups: Awaited<ReturnType<ToolMenuProvider['listMenuGroups']>>) => {
  const seen: Array<{ userId: string; sessionId: string }> = [];
  setToolMenuProvider({
    listMenuGroups: async (ctx) => {
      seen.push({ userId: ctx.user.userId, sessionId: ctx.sessionId });
      return groups;
    },
  });
  return seen;
};

afterEach(() => {
  resetSessionApp();
  setToolMenuProvider({ listMenuGroups: async () => [] });
});

describe('tools.service', () => {
  it('drops descriptions and treats absent as enabled', () => {
    const tools = toSessionTools(
      ['a', { toolName: 'b', description: 'a very long paragraph' }, 'c'],
      new Set(['b'])
    );
    expect(tools).toEqual([
      { toolName: 'a', enabled: true },
      { toolName: 'b', enabled: false },
      { toolName: 'c', enabled: true },
    ]);
    expect(JSON.stringify(tools)).not.toContain('description');
  });

  it('disabledNamesFor and filterEnabled', () => {
    const disabled = disabledNamesFor({ knowledge: ['b'] }, 'knowledge');
    expect([...disabled]).toEqual(['b']);
    expect([...disabledNamesFor(undefined, 'x')]).toEqual([]);
    expect(filterEnabled(['a', 'b'], disabled)).toEqual(['a']);
  });
});

describe('session tools routes', () => {
  const menu = [{ mcp: 'knowledge', toolNames: ['a', 'b'] }];

  const session = async (t: ReturnType<typeof makeSessionApp>) =>
    (await request(t.app).post('/service/session').set(A).send({})).body.data.id as string;

  it('the default provider answers an empty menu', async () => {
    const t = makeSessionApp();
    const id = await session(t);
    const res = await request(t.app).get(`/service/session/${id}/tools`).set(A);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('assembles groups from the provider with the stored negative list (GET and POST alias)', async () => {
    const seen = provider(menu);
    const t = makeSessionApp();
    const id = await session(t);
    await request(t.app)
      .put(`/service/session/${id}/tools`)
      .set(A)
      .send({ tools: [{ mcp: 'knowledge', tools: [{ toolName: 'b', enabled: false }] }] });
    const expected = [
      {
        mcp: 'knowledge',
        tools: [
          { toolName: 'a', enabled: true },
          { toolName: 'b', enabled: false },
        ],
      },
    ];
    const get = await request(t.app).get(`/service/session/${id}/tools`).set(A);
    expect(get.body.data).toEqual(expected);
    const post = await request(t.app).post(`/service/session/${id}/tools`).set(A).send({});
    expect(post.body.data).toEqual(expected);
    expect(seen[0]).toEqual({ userId: 'user-a', sessionId: id });
  });

  it('marks names without a backing tool as available:false and leaves the others untouched', async () => {
    provider([{ mcp: 'stripe', toolNames: ['a', 'b'], unavailableToolNames: ['b'] }]);
    const t = makeSessionApp();
    const id = await session(t);
    const res = await request(t.app).get(`/service/session/${id}/tools`).set(A);
    expect(res.body.data).toEqual([
      {
        mcp: 'stripe',
        tools: [
          { toolName: 'a', enabled: true },
          { toolName: 'b', enabled: true, available: false },
        ],
      },
    ]);
  });

  it('a new tool from a source is enabled by default', async () => {
    provider([{ mcp: 'knowledge', toolNames: ['a', 'b', 'c'] }]);
    const t = makeSessionApp();
    const id = await session(t);
    await request(t.app)
      .put(`/service/session/${id}/tools`)
      .set(A)
      .send({ tools: [{ mcp: 'knowledge', tools: [{ toolName: 'b', enabled: false }] }] });
    const res = await request(t.app).get(`/service/session/${id}/tools`).set(A);
    expect(res.body.data[0].tools.find((x: { toolName: string }) => x.toolName === 'c').enabled).toBe(true);
  });

  it('serialised response never carries a description key', async () => {
    provider([{ mcp: 'g', toolNames: [{ toolName: 'a', description: 'long text' }] }]);
    const t = makeSessionApp();
    const id = await session(t);
    const res = await request(t.app).get(`/service/session/${id}/tools`).set(A);
    expect(JSON.stringify(res.body)).not.toContain('description');
  });

  it('switching off and on stores and then removes the group key', async () => {
    const t = makeSessionApp();
    const id = await session(t);
    const put = (enabled: boolean) =>
      request(t.app)
        .put(`/service/session/${id}/tools`)
        .set(A)
        .send({ tools: [{ mcp: 'knowledge', tools: [{ toolName: 'a', enabled }] }] });
    const user = { userId: 'user-a', projectKey: 'p', isAdmin: false };
    const off = await put(false);
    expect(off.body.data).toEqual([{ mcp: 'knowledge', tools: [{ toolName: 'a', enabled: false }] }]);
    expect((await t.services.sessions.get(id, user))?.disabledTools).toEqual({ knowledge: ['a'] });
    await put(true);
    expect((await t.services.sessions.get(id, user))?.disabledTools).toBeUndefined();
  });

  it('a group absent from the body is untouched', async () => {
    const t = makeSessionApp();
    const id = await session(t);
    const send = (mcp: string) =>
      request(t.app)
        .put(`/service/session/${id}/tools`)
        .set(A)
        .send({ tools: [{ mcp, tools: [{ toolName: 'x', enabled: false }] }] });
    await send('knowledge');
    await send('stripe');
    const user = { userId: 'user-a', projectKey: 'p', isAdmin: false };
    expect((await t.services.sessions.get(id, user))?.disabledTools).toEqual({
      knowledge: ['x'],
      stripe: ['x'],
    });
  });

  it.each([
    [{}],
    [{ tools: 'x' }],
    [{ tools: [{ tools: [] }] }],
    [{ tools: [{ mcp: 'a', tools: 'no' }] }],
    [{ tools: [{ mcp: 'a', tools: [{ toolName: 'x' }] }] }],
    [{ tools: [{ mcp: 'a', tools: [{ toolName: 1, enabled: true }] }] }],
  ])('rejects the invalid body %j', async (body) => {
    const t = makeSessionApp();
    const id = await session(t);
    const res = await request(t.app).put(`/service/session/${id}/tools`).set(A).send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('a group named __proto__ is stored as an ordinary key', async () => {
    const t = makeSessionApp();
    const id = await session(t);
    const res = await request(t.app)
      .put(`/service/session/${id}/tools`)
      .set(A)
      .set('content-type', 'application/json')
      .send('{"tools":[{"mcp":"__proto__","tools":[{"toolName":"x","enabled":false}]}]}');
    expect(res.status).toBe(200);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false);
  });
});
