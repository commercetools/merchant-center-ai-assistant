/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createReadiness } from '../../src/nimbus/readiness';
import type { NimbusProcessManager } from '../../src/nimbus/process-manager';
import { FAKE_NIMBUS, makeManager, recordingLog } from './helpers';

const managers: NimbusProcessManager[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.close()));
});

describe('readiness with the fake child', () => {
  test('ok when all 7 tools are served', async () => {
    const { manager } = makeManager();
    managers.push(manager);
    expect(await manager.readiness()).toMatchObject({
      status: 'ok',
      nimbusMcp: '9.9.9-test',
      tools: 7,
    });
  });

  test('degraded names the missing tool', async () => {
    const { manager } = makeManager({
      extraEnv: { FAKE_NIMBUS_MISSING: 'get_tokens' },
    });
    managers.push(manager);
    expect(await manager.readiness()).toMatchObject({
      status: 'degraded',
      tools: 6,
      missing: ['get_tokens'],
    });
  });

  test('extra tools are warned about but stay ok', async () => {
    const { manager, log } = makeManager({
      extraEnv: { FAKE_NIMBUS_EXTRA: 'brand_new_tool' },
    });
    managers.push(manager);
    expect((await manager.readiness()).status).toBe('ok');
    expect(
      log.entries.some((e) => e.message === 'nimbus-mcp serves unexpected tools')
    ).toBe(true);
  });

  test('error when the child cannot be reached', async () => {
    const { manager } = makeManager({
      entry: `${FAKE_NIMBUS}.does-not-exist`,
      spawnTimeoutMs: 3_000,
    });
    managers.push(manager);
    const result = await manager.readiness();
    expect(result.status).toBe('error');
    expect(result.reason).toBeTruthy();
  });
});

describe('createReadiness cache', () => {
  test('a verdict is reused for 30 s, a failure for 5 s; never rejects', async () => {
    let now = 1_000;
    const listToolNames = jest.fn<() => Promise<string[]>>();
    listToolNames.mockRejectedValueOnce(new Error('down'));
    listToolNames.mockResolvedValue([
      'list_components',
      'get_component',
      'get_docs_page',
      'search_docs',
      'get_tokens',
      'search_icons',
      'migrate_from_uikit',
    ]);
    const check = createReadiness({
      listToolNames,
      version: '1.0.0',
      log: recordingLog(),
      now: () => now,
    });

    expect((await check()).status).toBe('error');
    await check();
    expect(listToolNames).toHaveBeenCalledTimes(1);

    now += 5_001;
    expect((await check()).status).toBe('ok');
    now += 29_000;
    await check();
    expect(listToolNames).toHaveBeenCalledTimes(2);
    now += 2_000;
    await check();
    expect(listToolNames).toHaveBeenCalledTimes(3);
  });
});
