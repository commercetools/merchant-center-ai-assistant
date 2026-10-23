/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, jest, test } from '@jest/globals';
import type { Tool, ToolSet } from 'ai';
import { CUSTOM_VIEW_SOURCES } from '../../src/chat/custom-view-orchestrator';
import { registry } from '../../src/tool-sources';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { NIMBUS_EXPECTED_TOOLS } from '../../src/nimbus/constants';
import { createNimbusToolSource } from '../../src/nimbus/tool-source';
import { makeToolContext, StubToolSource } from '../helpers/stub-tool-source';
import { recordingLog } from './helpers';

const tools = (): ToolSet =>
  Object.fromEntries(
    NIMBUS_EXPECTED_TOOLS.map((name) => [
      name,
      { execute: async () => name } as unknown as Tool,
    ])
  );

describe('nimbus source in the registry', () => {
  test('the process-wide registry has it, next to the built-ins', () => {
    expect(registry.list().map((s) => s.name)).toContain('nimbus');
  });

  test('standard turns get get_components; custom-view turns never touch the child', async () => {
    const backendTools = jest.fn(async () => tools());
    const local = createToolSourceRegistry();
    local.register(
      new StubToolSource({
        name: 'commercetools',
        tools: { list_orders: { execute: async () => 1 } as unknown as Tool },
      }),
      new StubToolSource({ name: 'commercetools-knowledge', tools: {} }),
      createNimbusToolSource({
        backend: () => ({
          tools: backendTools,
          readiness: async () => ({ status: 'ok' }),
          close: async () => undefined,
        }),
        enabled: () => true,
        log: recordingLog(),
      })
    );
    const ctx = makeToolContext();

    const standard = await local.resolve(ctx);
    expect(Object.keys(standard.tools)).toContain('get_components');
    expect(Object.keys(standard.tools)).not.toContain('get_component');
    expect(backendTools).toHaveBeenCalledTimes(1);

    backendTools.mockClear();
    const customView = await local.resolve(ctx, { only: CUSTOM_VIEW_SOURCES });
    expect(Object.keys(customView.tools)).not.toContain('get_components');
    expect(backendTools).not.toHaveBeenCalled();

    // No menu group for it.
    const groups = await local.listMenuGroups(ctx);
    expect(JSON.stringify(groups)).not.toContain('nimbus');
    ctx.dispose();
  });
});
