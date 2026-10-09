/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { tool } from 'ai';
import { z } from 'zod';
import { getCache } from '../../src/cache';
import {
  getMcpPrompt,
  getMcpTools,
  setMcpClientFactoryForTests,
} from '../../src/tool-sources/mcp-tools';
import { freshConfig } from '../helpers/env';
import { fakeMcpFactory, offlineMcpFactory } from '../helpers/mcp';
import { fakeLog } from '../helpers/stub-tool-source';

const t = tool({
  description: 'd',
  inputSchema: z.object({}),
  execute: async () => 'ok',
});
const base = {
  url: 'https://x.example.com/mcp',
  ttlMs: 60_000,
  timeoutMs: 1000,
  label: 'test',
};

beforeEach(async () => {
  freshConfig();
  await getCache().clearNamespace('mcp:tools');
});
afterEach(() => setMcpClientFactoryForTests(offlineMcpFactory));

describe('getMcpTools', () => {
  it('caches: the second call does not handshake again; default redirect is "error"', async () => {
    const factory = fakeMcpFactory({ tools: { a: t } });
    setMcpClientFactoryForTests(factory);
    const log = fakeLog();
    expect(
      Object.keys((await getMcpTools({ ...base, cacheKey: 'k1', log })) ?? {})
    ).toEqual(['a']);
    await getMcpTools({ ...base, cacheKey: 'k1', log });
    expect(factory.configs).toHaveLength(1);
    expect(factory.configs[0].redirect).toBe('error');
  });

  it('passes headers and the follow mode through', async () => {
    const factory = fakeMcpFactory({ tools: { a: t } });
    setMcpClientFactoryForTests(factory);
    await getMcpTools({
      ...base,
      cacheKey: 'k2',
      log: fakeLog(),
      redirect: 'follow',
      headers: { 'x-a': '1' },
    });
    expect(factory.configs[0]).toMatchObject({
      redirect: 'follow',
      headers: { 'x-a': '1' },
    });
  });

  it('failure: null, a class-only log line, nothing cached', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({
        failTools: Object.assign(new Error('SENTINEL'), { statusCode: 401 }),
      })
    );
    const log = fakeLog();
    expect(await getMcpTools({ ...base, cacheKey: 'k3', log })).toBeNull();
    expect(log.warnings[0]).toContain('class=Error status=401');
    expect(log.warnings[0]).not.toContain('SENTINEL');
    expect(log.warnings[0]).not.toContain('example.com');
    expect(await getCache().get('mcp:tools', 'k3')).toBeNull();
  });

  it('timeout 0 disables the deadline', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({ tools: { a: t }, toolsDelayMs: 30 })
    );
    const tools = await getMcpTools({
      ...base,
      timeoutMs: 0,
      cacheKey: 'k4',
      log: fakeLog(),
    });
    expect(Object.keys(tools ?? {})).toEqual(['a']);
  });
});

describe('getMcpPrompt', () => {
  const p = { url: base.url, ttlMs: 60_000, label: 'test' };

  it('returns the text, caches it and closes the client', async () => {
    const factory = fakeMcpFactory({ prompts: { tips: 'hello' } });
    setMcpClientFactoryForTests(factory);
    expect(
      await getMcpPrompt({ ...p, cacheKey: 'p1', name: 'tips', log: fakeLog() })
    ).toBe('hello');
    expect(
      await getMcpPrompt({ ...p, cacheKey: 'p1', name: 'tips', log: fakeLog() })
    ).toBe('hello');
    expect(factory.configs).toHaveLength(1);
    expect(factory.closed).toBe(1);
  });

  it('a missing prompt gives null and a warning', async () => {
    setMcpClientFactoryForTests(fakeMcpFactory({ prompts: {} }));
    const log = fakeLog();
    expect(
      await getMcpPrompt({ ...p, cacheKey: 'p2', name: 'nope', log })
    ).toBeNull();
    expect(log.warnings[0]).toContain('MCP_PROMPT_FAILED');
  });
});
