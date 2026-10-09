/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterAll, describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { NIMBUS_EXPECTED_TOOLS } from '../../src/nimbus/constants';
import { NimbusProcessManager } from '../../src/nimbus/process-manager';
import { isResolveError, resolveNimbusMcp } from '../../src/nimbus/resolve';
import { callTool, isAlive, recordingLog, waitFor } from './helpers';

/**
 * @integration The REAL @commercetools/nimbus-mcp child (no network needed). The fixture
 * cannot catch a protocol or tool-set change of a Nimbus release; this does.
 */
const resolved = resolveNimbusMcp();
if (isResolveError(resolved)) throw new Error(resolved.error);

const rssMb = (pid: number): number =>
  Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)]).toString()) /
  1024;

const describeUnix = process.platform === 'win32' ? describe.skip : describe;

describeUnix('real nimbus-mcp child', () => {
  const manager = new NimbusProcessManager({
    ...resolved,
    log: recordingLog(),
  });
  afterAll(() => manager.close());

  test('serves the 7 expected tools and stays small', async () => {
    const tools = await manager.tools();
    expect(Object.keys(tools).sort()).toEqual(
      [...NIMBUS_EXPECTED_TOOLS].sort()
    );
    expect(manager.pid).not.toBeNull();
    expect(rssMb(manager.pid as number)).toBeLessThan(150);
    expect((await manager.readiness()).status).toBe('ok');
  });

  test('get_component answers for a real component', async () => {
    const tools = await manager.tools();
    const result = (await callTool(tools, 'get_component', {
      name: 'Button',
      section: 'props',
    })) as { content: Array<{ text: string }> };
    expect(result.content[0].text.length).toBeGreaterThan(100);
  });

  test('survives kill -9 of the child', async () => {
    const tools = await manager.tools();
    const before = manager.pid as number;
    process.kill(before, 'SIGKILL');
    await waitFor(() => manager.pid === null);
    await callTool(tools, 'list_components', {});
    expect(manager.pid).not.toBe(before);
    await waitFor(() => !isAlive(before));
  });
});
