/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createMCPClient } from '@ai-sdk/mcp';
import { describe, expect, test } from '@jest/globals';
import { NimbusTransport } from '../../src/nimbus/transport';
import { callTool, FAKE_NIMBUS, textOf, waitFor } from './helpers';

describe('NimbusTransport', () => {
  test('createMCPClient over it lists 7 tools with execute and toModelOutput; stderr is readable', async () => {
    let closed = 0;
    const transport = new NimbusTransport(
      { command: process.execPath, args: [FAKE_NIMBUS], env: {} },
      () => {
        closed += 1;
      }
    );
    const stderrLines: string[] = [];
    transport.stderr?.on('data', (chunk: Buffer) =>
      stderrLines.push(String(chunk))
    );

    const client = await createMCPClient({ transport });
    const tools = await client.tools();
    expect(Object.keys(tools)).toHaveLength(7);
    for (const tool of Object.values(tools)) {
      expect(typeof tool.execute).toBe('function');
      expect(typeof tool.toModelOutput).toBe('function');
    }
    expect(transport.pid).toBeGreaterThan(0);

    expect(textOf(await callTool(tools, 'search_docs', { query: 'noise' }))).toBe(
      'noisy'
    );
    await waitFor(() => stderrLines.join('').includes('deprecation notice'));

    await client.close();
    // The manager's own hook fires as well as the client's.
    await waitFor(() => closed > 0);
  });
});
