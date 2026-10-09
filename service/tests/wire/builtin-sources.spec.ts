/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import {
  AGENT_KEYS,
  AGENT_META,
  AgentKeySchema,
  gatedAgentKeys,
  logGatedAgentKeys,
} from '../../src/agents/agent-keys';
import { buildPreamble } from '../../src/chat/preamble';
import { registry } from '../../src/tool-sources';
import { freshConfig } from '../helpers/env';
import {
  fakeLog,
  makeToolContext,
  StubToolSource,
} from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
});

describe('built-in sources', () => {
  it('the process-wide registry resolves the three always-on tools', async () => {
    const ctx = makeToolContext({
      // The registry also holds the nimbus source (change K); keep it from spawning a child.
      config: freshConfig({ NIMBUS_MCP_ENABLED: 'false' }),
    });
    contexts.push(ctx);
    const { tools, contributing } = await registry.resolve(ctx);
    expect(Object.keys(tools).sort()).toEqual([
      'create_entity_link',
      'export_data',
      'visualize_data',
    ]);
    expect(contributing.map((s) => s.name)).toEqual([
      'entity-link',
      'visualize',
      'export',
    ]);
    expect(registry.list().map((s) => s.name)).toContain('imageGeneration');
  });

  it('they have no menu group', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const groups = await registry.listMenuGroups(ctx);
    // Other changes register menu sources too (J: commercetools-knowledge); the built-ins none.
    const builtIn = ['entity-link', 'visualize', 'export', 'imageGeneration'];
    expect(groups.filter((g) => builtIn.includes(g.mcp))).toEqual([]);
  });

  it('are core sources, not connected integrations', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    expect(await registry.listConnectedSourceNames(ctx)).toEqual([]);
  });

  it('prompt fragments carry no project system prompt', async () => {
    const ctx = makeToolContext({ projectSystemPrompt: 'DEV-RULES' });
    contexts.push(ctx);
    const { fragments } = await registry.resolve(ctx);
    expect(fragments.join('')).not.toContain('DEV-RULES');
  });
});

describe('agent keys', () => {
  it('lists the nine keys and every key has a description', () => {
    expect(AGENT_KEYS).toHaveLength(9);
    for (const key of AGENT_KEYS) {
      expect(AGENT_META[key].description.length).toBeGreaterThan(10);
      expect(AgentKeySchema.safeParse(key).success).toBe(true);
    }
    expect(AgentKeySchema.safeParse('unknown').success).toBe(false);
  });

  it('reports the keys without a source in one info line', () => {
    const log = fakeLog();
    const gated = logGatedAgentKeys(
      {
        list: () => [
          { name: 'visualize' },
          { name: 'export' },
          { name: 'entity-link' },
        ],
      },
      log
    );
    expect(gated).toEqual([
      'commercetools',
      'contentstack',
      'algolia',
      'stripe',
      'commercetoolsUI',
      'bigquery',
      'imageGeneration',
    ]);
    expect(log.messages).toHaveLength(1);
    expect(gatedAgentKeys(AGENT_KEYS)).toEqual([]);
  });
});

describe('preamble', () => {
  const stub = (name: string, displayName: string, description?: string) =>
    new StubToolSource({ name, displayName, description });

  it('lists only the contributing sources', () => {
    const text = buildPreamble([
      stub('visualize', 'Data visualization', 'Makes charts.'),
    ]);
    expect(text).toContain('### Data visualization');
    expect(text).toContain('Makes charts.');
    expect(text.toLowerCase()).not.toContain('stripe');
    expect(text.toLowerCase()).not.toContain('algolia');
  });

  it('keeps the rules: latest message first, relative entity links, no blanket delegation', () => {
    const text = buildPreamble([]);
    expect(text).toContain('Prioritize the most recent messages');
    expect(text).toContain('Entity links are always RELATIVE');
    expect(text).not.toContain('Always delegate');
    expect(text).toContain('No data tools are connected right now.');
  });
});
