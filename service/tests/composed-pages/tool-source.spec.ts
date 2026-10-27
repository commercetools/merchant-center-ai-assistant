/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { STORABLE_TOOLS } from '../../src/chat/constants';
import { CUSTOM_VIEW_SOURCES } from '../../src/chat/custom-view-orchestrator';
import { composedPageSource } from '../../src/composed-pages/tool-source';
import { registry } from '../../src/tool-sources';
import { freshConfig } from '../helpers/env';
import { makeToolContext } from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
});

const ctxWith = (env: NodeJS.ProcessEnv = {}) => {
  const ctx = makeToolContext({
    // Keep the nimbus source from spawning a real child.
    config: freshConfig({ NIMBUS_MCP_ENABLED: 'false', ...env }),
  });
  contexts.push(ctx);
  return ctx;
};

describe('composed page tool source', () => {
  it('contributes exactly create_composed_page, order 60, no menu group', async () => {
    const ctx = ctxWith();
    expect(composedPageSource.order).toBe(60);
    expect(Object.keys(await composedPageSource.getTools(ctx))).toEqual([
      'create_composed_page',
    ]);
    expect(await composedPageSource.listForMenu(ctx)).toBeNull();
    expect(await composedPageSource.isEnabled(ctx)).toBe(true);
  });

  it('is registered process-wide and the tool is storable', async () => {
    const ctx = ctxWith();
    expect(registry.list().map((s) => s.name)).toContain(
      composedPageSource.name
    );
    const { tools } = await registry.resolve(ctx);
    expect(Object.keys(tools)).toContain('create_composed_page');
    expect(STORABLE_TOOLS).toContain('create_composed_page');
    expect(tools.create_composed_page.description).toContain('5.0');
  });

  it('the prompt mentions Nimbus tools only when the merged set has them (ctx.hasTool)', () => {
    // Kill switch says "enabled" but the merged set has no Nimbus tool: no mention.
    const ctx = ctxWith({ NIMBUS_MCP_ENABLED: 'true' });
    expect(composedPageSource.getPrompt({ ...ctx, hasTool: () => false })).not.toContain(
      'get_components'
    );
    expect(composedPageSource.getPrompt({ ...ctx, hasTool: () => true })).toContain(
      'get_components'
    );
    // Without hasTool it falls back to the kill switch.
    expect(composedPageSource.getPrompt(ctx)).toContain('get_components');
  });

  it('is not part of the custom-view selection', async () => {
    expect(CUSTOM_VIEW_SOURCES as readonly string[]).not.toContain(
      composedPageSource.name
    );
    const ctx = ctxWith();
    const { tools } = await registry.resolve(ctx, {
      only: [...CUSTOM_VIEW_SOURCES],
    });
    expect(Object.keys(tools)).not.toContain('create_composed_page');
  });

  it('gates the Nimbus lookup section on the nimbus kill switch', () => {
    const off = composedPageSource.getPrompt(
      ctxWith({ NIMBUS_MCP_ENABLED: 'false' })
    );
    const on = composedPageSource.getPrompt(
      ctxWith({ NIMBUS_MCP_ENABLED: 'true' })
    );
    expect(on).toContain('Look up the Nimbus API');
    expect(off).not.toContain('Look up the Nimbus API');
  });
});
