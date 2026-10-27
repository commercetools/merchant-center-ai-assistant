/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import type { NimbusProcessManager } from '../../src/nimbus/process-manager';
import {
  callTool,
  isAlive,
  makeManager,
  startedPids,
  textOf,
  waitFor,
} from './helpers';

const managers: NimbusProcessManager[] = [];
const track = (m: ReturnType<typeof makeManager>) => {
  managers.push(m.manager);
  return m;
};

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.close()));
});

describe('NimbusProcessManager lifecycle', () => {
  test('8 concurrent first callers share one child', async () => {
    const { manager, pids } = track(makeManager());
    const results = await Promise.all(
      Array.from({ length: 8 }, () => manager.tools())
    );
    expect(results.every((t) => Object.keys(t).length === 7)).toBe(true);
    expect(startedPids(pids)).toHaveLength(1);
  });

  test('nothing is spawned before first use', () => {
    const { pids } = track(makeManager());
    expect(startedPids(pids)).toHaveLength(0);
  });

  test('a killed child is replaced on the next call and no orphan stays', async () => {
    const { manager, pids } = track(makeManager());
    const tools = await manager.tools();
    const [first] = startedPids(pids);
    process.kill(first, 'SIGKILL');
    await waitFor(() => manager.pid === null);

    expect(textOf(await callTool(tools, 'get_tokens', { name: 'x' }))).toMatch(
      /get_tokens/
    );
    const all = startedPids(pids);
    expect(all).toHaveLength(2);
    await waitFor(() => !isAlive(first));
    expect(isAlive(all[1])).toBe(true);
  });

  test('a child that exits mid-call fails that call and the next one respawns', async () => {
    const { manager, pids } = track(makeManager());
    const tools = await manager.tools();
    await expect(
      callTool(tools, 'search_docs', { query: 'die' })
    ).rejects.toThrow();
    await waitFor(() => manager.pid === null);
    expect(
      textOf(await callTool(tools, 'search_docs', { query: 'ok' }))
    ).toMatch(/search_docs/);
    expect(startedPids(pids)).toHaveLength(2);
  });

  test('close() stops the child and refuses to respawn', async () => {
    const { manager, pids } = track(makeManager());
    await manager.tools();
    const [pid] = startedPids(pids);
    await manager.close();
    await waitFor(() => !isAlive(pid));
    await expect(manager.tools()).rejects.toThrow(/shut down/);
  });

  test('idle shutdown stops the child; the next call respawns', async () => {
    const { manager, pids } = track(makeManager({ idleShutdownMs: 300 }));
    const tools = await manager.tools();
    const [pid] = startedPids(pids);
    await waitFor(() => !isAlive(pid), 3_000);
    expect(manager.pid).toBeNull();
    await callTool(tools, 'list_components', {});
    expect(startedPids(pids)).toHaveLength(2);
  });
});

describe('timeouts', () => {
  test('three consecutive timeouts recycle the child; the next call works on a new one', async () => {
    const { manager, log, pids } = track(makeManager({ callTimeoutMs: 200 }));
    const tools = await manager.tools();
    for (let i = 0; i < 3; i += 1) {
      await expect(
        callTool(tools, 'search_docs', { query: 'hang' })
      ).rejects.toThrow();
    }
    expect(log.entries.some((e) => e.message === 'recycling upstream')).toBe(true);
    expect(
      textOf(await callTool(tools, 'search_docs', { query: 'ok' }))
    ).toMatch(/search_docs/);
    const all = startedPids(pids);
    expect(all).toHaveLength(2);
    await waitFor(() => !isAlive(all[0]));
  });

  test('a success resets the counter: timeout, timeout, success, timeout does not recycle', async () => {
    const { manager, log } = track(makeManager({ callTimeoutMs: 200 }));
    const tools = await manager.tools();
    const hang = () => callTool(tools, 'search_docs', { query: 'hang' });
    await expect(hang()).rejects.toThrow();
    await expect(hang()).rejects.toThrow();
    await callTool(tools, 'list_components', {});
    await expect(hang()).rejects.toThrow();
    expect(log.entries.some((e) => e.message === 'recycling upstream')).toBe(false);
  });

  test('a caller that aborts is not counted as a timeout', async () => {
    const { manager, log } = track(makeManager({ callTimeoutMs: 5_000 }));
    const tools = await manager.tools();
    for (let i = 0; i < 4; i += 1) {
      const controller = new AbortController();
      const pending = callTool(
        tools,
        'search_docs',
        { query: 'hang' },
        { abortSignal: controller.signal }
      );
      setTimeout(() => controller.abort(), 50);
      await expect(pending).rejects.toThrow();
    }
    expect(log.entries.some((e) => e.message === 'recycling upstream')).toBe(false);
  });
});

describe('child output and environment', () => {
  test('stderr becomes exactly one structured warn log', async () => {
    const { manager, log } = track(makeManager());
    const tools = await manager.tools();
    expect(
      textOf(await callTool(tools, 'search_docs', { query: 'noise' }))
    ).toBe('noisy');
    await waitFor(() => log.entries.some((e) => e.message === 'nimbus-mcp stderr'));
    const lines = log.entries.filter((e) => e.message === 'nimbus-mcp stderr');
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('warn');
    expect(lines[0].meta).toMatchObject({
      source: 'nimbus-mcp',
      line: 'deprecation notice',
    });
  });

  test('the child does not inherit service secrets', async () => {
    process.env.ENCRYPTION_KEY = 'secret-for-test';
    process.env.GCP_SA_KEY_BASE64 = 'secret-for-test';
    process.env.CTP_CLIENT_SECRET = 'secret-for-test';
    try {
      const { manager } = track(makeManager());
      const tools = await manager.tools();
      const names = textOf(
        await callTool(tools, 'search_docs', { query: 'env' })
      ).split(',');
      expect(names).toContain('NODE_OPTIONS');
      expect(names).not.toContain('ENCRYPTION_KEY');
      expect(names).not.toContain('GCP_SA_KEY_BASE64');
      expect(names.filter((n) => n.startsWith('CTP_'))).toEqual([]);
    } finally {
      delete process.env.ENCRYPTION_KEY;
      delete process.env.GCP_SA_KEY_BASE64;
      delete process.env.CTP_CLIENT_SECRET;
    }
  });
});
