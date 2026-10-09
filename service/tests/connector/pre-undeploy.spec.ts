/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createLifecycleApiRoot, PROBE_CONTAINER, PROBE_KEY } from '../../src/connector/checks/custom-object-probe';
import { readLifecycleEnv } from '../../src/connector/env';
import { PreUndeployDeps, run } from '../../src/connector/pre-undeploy';
import { API, customObjectHandlers, lifecycleEnv, tokenHandler } from '../helpers/lifecycle';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function deps(): { deps: PreUndeployDeps; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    deps: {
      readEnv: () => readLifecycleEnv(lifecycleEnv()),
      apiRoot: (env) => createLifecycleApiRoot(env),
      log: (l) => lines.push(l),
    },
  };
}

describe('pre-undeploy run()', () => {
  it('pre-undeploy: probe removed', async () => {
    const store = new Map([[`${PROBE_CONTAINER}/${PROBE_KEY}`, { container: PROBE_CONTAINER, key: PROBE_KEY, value: {} }]]);
    server.use(tokenHandler, ...customObjectHandlers(store));
    const { deps: d, lines } = deps();
    expect(await run(d)).toBe(0);
    expect(store.size).toBe(0);
    expect(lines).toContain('pre-undeploy: probe object removed');
  });

  it('pre-undeploy: no probe is fine', async () => {
    server.use(tokenHandler, ...customObjectHandlers(new Map()));
    const { deps: d, lines } = deps();
    expect(await run(d)).toBe(0);
    expect(lines).toContain('pre-undeploy: no probe object to remove');
  });

  it('pre-undeploy: data untouched', async () => {
    const store = new Map([
      ['ai-assistant-sessions/s1', { container: 'ai-assistant-sessions', key: 's1', value: { a: 1 } }],
      ['ai-assistant-settings/cfg', { container: 'ai-assistant-settings', key: 'cfg', value: { b: 2 } }],
    ]);
    const deletes: string[] = [];
    server.use(
      tokenHandler,
      http.delete(`${API}/p1/*`, ({ request }) => {
        deletes.push(new URL(request.url).pathname);
        return undefined;
      }),
      ...customObjectHandlers(store)
    );
    const { deps: d, lines } = deps();
    expect(await run(d)).toBe(0);
    expect(store.size).toBe(2);
    expect(deletes).toEqual([`/p1/custom-objects/${PROBE_CONTAINER}/${PROBE_KEY}`]);
    expect(lines).toContain('pre-undeploy: data retained in ai-assistant-sessions');
    expect(lines).toContain('pre-undeploy: data retained in ai-assistant-settings');
  });

  it('pre-undeploy: api unreachable does not block', async () => {
    server.use(tokenHandler, http.all(`${API}/p1/*`, () => HttpResponse.json({ statusCode: 503, message: 'x' }, { status: 503 })));
    const { deps: d, lines } = deps();
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.startsWith('pre-undeploy: warning: cleanup incomplete'))).toBe(true);
  });

  it('pre-undeploy: an incomplete environment does not block', async () => {
    const lines: string[] = [];
    expect(await run({ readEnv: () => readLifecycleEnv({}), apiRoot: () => { throw new Error('unused'); }, log: (l) => lines.push(l) })).toBe(0);
    expect(lines[0]).toContain('warning');
  });
});
