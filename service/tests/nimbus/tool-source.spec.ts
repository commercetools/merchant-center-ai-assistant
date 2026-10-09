/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import type { Tool, ToolSet } from 'ai';
import type { NimbusBackend } from '../../src/nimbus/backend';
import { NIMBUS_EXPECTED_TOOLS } from '../../src/nimbus/constants';
import type { NimbusProcessManager } from '../../src/nimbus/process-manager';
import { createNimbusToolSource } from '../../src/nimbus/tool-source';
import { makeToolContext } from '../helpers/stub-tool-source';
import { makeManager, recordingLog, startedPids } from './helpers';

const sevenTools = (): ToolSet =>
  Object.fromEntries(
    NIMBUS_EXPECTED_TOOLS.map((name) => [
      name,
      { execute: async () => name } as unknown as Tool,
    ])
  );

const backendOf = (impl: () => Promise<ToolSet>): NimbusBackend & {
  tools: jest.Mock<() => Promise<ToolSet>>;
} => ({
  tools: jest.fn(impl),
  readiness: async () => ({ status: 'ok' }),
  close: async () => undefined,
});

describe('nimbus tool source', () => {
  const ctx = makeToolContext();
  afterEach(() => ctx.dispose());

  test('serves the 7 tools minus get_component plus get_components', async () => {
    const backend = backendOf(async () => sevenTools());
    const source = createNimbusToolSource({
      backend: () => backend,
      enabled: () => true,
      log: recordingLog(),
    });
    const tools = await source.getTools(ctx);
    expect(Object.keys(tools).sort()).toEqual(
      [
        'list_components',
        'get_components',
        'get_docs_page',
        'search_docs',
        'get_tokens',
        'search_icons',
        'migrate_from_uikit',
      ].sort()
    );
  });

  test('identity: name, order after the page-generation source, no menu, no prompt', async () => {
    const source = createNimbusToolSource({
      backend: () => backendOf(async () => sevenTools()),
      enabled: () => true,
      log: recordingLog(),
    });
    expect(source.name).toBe('nimbus');
    expect(source.displayName).toBe('Nimbus design system');
    expect(source.order).toBe(61);
    expect(await source.listForMenu(ctx)).toBeNull();
    expect(source.getPrompt(ctx)).toBe('');
  });

  test('a slow first handshake yields no tools now and the tools next turn', async () => {
    const log = recordingLog();
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const backend = backendOf(async () => {
      if (first) {
        first = false;
        await ready;
      }
      return sevenTools();
    });
    const source = createNimbusToolSource({
      backend: () => backend,
      enabled: () => true,
      log,
      handshakeDeadlineMs: 100,
    });
    expect(await source.getTools(ctx)).toEqual({});
    expect(log.entries.some((e) => e.message === 'NIMBUS_HANDSHAKE_DEADLINE')).toBe(true);
    release?.();
    expect(Object.keys(await source.getTools(ctx))).toContain('get_components');
  });

  test('a failing backend becomes an empty tool set and a log line', async () => {
    const log = recordingLog();
    const source = createNimbusToolSource({
      backend: () =>
        backendOf(async () => {
          throw new Error('spawn failed');
        }),
      enabled: () => true,
      log,
    });
    expect(await source.getTools(ctx)).toEqual({});
    expect(log.entries.some((e) => /unavailable/.test(e.message))).toBe(true);
  });

  test('disabled: isEnabled is false and the backend is never created', async () => {
    const backend = jest.fn(() => backendOf(async () => sevenTools()));
    const source = createNimbusToolSource({
      backend,
      enabled: () => false,
      log: recordingLog(),
    });
    expect(await source.isEnabled(ctx)).toBe(false);
    expect(backend).not.toHaveBeenCalled();
  });

  test('drift (missing or extra tools) is warned about once', async () => {
    const log = recordingLog();
    const served = sevenTools();
    delete served.get_tokens;
    served.shiny_new = { execute: async () => 'n' } as unknown as Tool;
    const source = createNimbusToolSource({
      backend: () => backendOf(async () => served),
      enabled: () => true,
      log,
    });
    await source.getTools(ctx);
    await source.getTools(ctx);
    expect(log.entries.filter((e) => e.message === 'nimbus-mcp tool set drift')).toHaveLength(1);
  });
});

describe('with the fake child (end to end through the manager)', () => {
  const managers: NimbusProcessManager[] = [];
  afterEach(async () => {
    await Promise.all(managers.splice(0).map((m) => m.close()));
  });

  test('a respawn between two tool calls of one turn is invisible', async () => {
    const { manager, pids } = makeManager();
    managers.push(manager);
    const source = createNimbusToolSource({
      backend: () => manager,
      enabled: () => true,
      log: recordingLog(),
    });
    const ctx = makeToolContext();
    const tools = await source.getTools(ctx);
    const execute = tools.get_components.execute;
    if (!execute) throw new Error('no execute');
    const options = { toolCallId: 'c', messages: [], context: undefined };

    const first = (await execute({ names: ['Button'] }, options)) as {
      components: Array<{ error?: string }>;
    };
    expect(first.components[0].error).toBeUndefined();

    await manager.recycle('test');
    const second = (await execute({ names: ['Card'] }, options)) as {
      components: Array<{ error?: string }>;
    };
    expect(second.components[0].error).toBeUndefined();
    expect(startedPids(pids)).toHaveLength(2);
    ctx.dispose();
  });
});
