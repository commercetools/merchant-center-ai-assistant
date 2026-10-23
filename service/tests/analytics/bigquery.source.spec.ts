/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { bigquerySource } from '../../src/analytics/tools/bigquery.source';
import { resetConfigurationForTests } from '../../src/config';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { createServices, resetServicesForTests, setServicesForTests } from '../../src/services/registry';
import { fakeKeyBase64 } from '../helpers/gcp';
import { FAKE_DATASET, sessionTableRef, useGcpEnv } from '../helpers/gcp-env';
import { freshConfig } from '../helpers/env';
import { makePersistence } from '../helpers/persistence';
import { makeToolContext, StubToolSource } from '../helpers/stub-tool-source';

afterEach(() => {
  resetConfigurationForTests();
  resetServicesForTests();
});

describe('the bigquery ToolSource', () => {
  it('is disabled without a service-account key', async () => {
    const ctx = makeToolContext({ config: freshConfig() });
    expect(await bigquerySource.isEnabled(ctx)).toBe(false);
  });

  it('is enabled with a key and offers both tools, without a menu group', async () => {
    const ctx = makeToolContext({ config: freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() }) });
    expect(ctx.config.gcp.bigquery.datasetId).toBe(FAKE_DATASET);
    expect(await bigquerySource.isEnabled(ctx)).toBe(true);
    expect(Object.keys(await bigquerySource.getTools(ctx)).sort()).toEqual(['get_table_info', 'query_aggregated_data']);
    expect(await bigquerySource.listForMenu(ctx)).toBeNull();
    expect(bigquerySource.getPrompt(ctx)).toContain('query_aggregated_data');
  });

  describe('tools are bound to the calling session and user', () => {
    let sessions: ReturnType<typeof createServices>['sessions'];

    beforeEach(async () => {
      useGcpEnv();
      const config = freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
      const { p } = makePersistence(undefined, { GCP_SA_KEY_BASE64: fakeKeyBase64() });
      const services = createServices(p);
      setServicesForTests(services);
      sessions = services.sessions;
      expect(config.gcp.projectId).toBeDefined();
    });

    it('get_table_info sees a table registered AFTER the tools were created (same turn)', async () => {
      const user = { userId: 'u1', projectKey: 'p', isAdmin: false };
      const session = await sessions.create(user, {});
      const ctx = makeToolContext({
        config: freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() }),
        sessionId: session.id,
        user,
      });
      // makeToolContext primes the configuration cache with its own default; re-read process.env.
      useGcpEnv();
      const tools = await bigquerySource.getTools(ctx);
      const run = (tableRef: string) =>
        (tools.get_table_info.execute as unknown as (i: unknown, o: unknown) => Promise<Record<string, unknown>>)(
          { tableRef },
          { toolCallId: 'c', messages: [] }
        );

      const ref = sessionTableRef(`${session.id.replace(/-/g, '_')}_read_orders`);
      expect(await run(ref)).toMatchObject({ success: false, availableTableRefs: [] });
      await sessions.addTemporaryTable(session.id, user, { tableRef: ref, toolName: 'read_orders', args: '{}' });
      // Registered now: the accessor re-reads the session, so the rejection is gone (the
      // metadata call itself then fails against Google, which is not available in tests).
      const after = await run(ref);
      expect(after.error).not.toContain('is not a table of this conversation');
    });

    it("another user's session is unreadable: no tables, informed failure", async () => {
      const owner = { userId: 'u1', projectKey: 'p', isAdmin: false };
      const session = await sessions.create(owner, {});
      await sessions.addTemporaryTable(session.id, owner, { tableRef: sessionTableRef('x'), toolName: 't', args: '{}' });
      const ctx = makeToolContext({
        config: freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() }),
        sessionId: session.id,
        user: { userId: 'intruder', projectKey: 'p', isAdmin: false },
      });
      useGcpEnv();
      const tools = await bigquerySource.getTools(ctx);
      const r = await (tools.get_table_info.execute as unknown as (i: unknown, o: unknown) => Promise<Record<string, unknown>>)(
        { tableRef: sessionTableRef('x') },
        { toolCallId: 'c', messages: [] }
      );
      expect(r).toMatchObject({ success: false, availableTableRefs: [] });
    });
  });

  it('does not collide with another source in the registry (M and K must not re-provide the tool)', async () => {
    const registry = createToolSourceRegistry();
    const ctx = makeToolContext({ config: freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() }) });
    registry.register(bigquerySource, new StubToolSource({ name: 'other', tools: {} }));
    const warnings: string[] = [];
    ctx.log.warn = (m: string) => void warnings.push(m);
    const resolved = await registry.resolve(ctx);
    expect(Object.keys(resolved.tools)).toContain('query_aggregated_data');
    expect(warnings.filter((w) => /collision|overrid/i.test(w))).toEqual([]);
  });
});
