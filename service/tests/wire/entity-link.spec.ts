/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { entityLinkSource } from '../../src/tool-sources/entity-link.source';
import { createEntityLinkToolFactory } from '../../src/tools/entity-link.tool';
import { makeToolContext } from '../helpers/stub-tool-source';

type Input = Parameters<
  ReturnType<typeof createEntityLinkToolFactory>['execute']
>[0];
const run = async (
  projectKey: string,
  input: unknown
): Promise<Record<string, unknown>> =>
  JSON.parse(
    await createEntityLinkToolFactory(projectKey).execute(input as Input)
  );

describe('create_entity_link', () => {
  it('builds a relative order link starting with /<projectKey>/orders/', async () => {
    const out = await run('my-project', {
      links: [{ entityType: 'order', id: 'o1', displayText: 'Order 1' }],
    });
    expect(out.success).toBe(true);
    const links = out.links as Array<{ url: string }>;
    expect(links[0].url.startsWith('/my-project/orders/')).toBe(true);
    expect(links[0].url.startsWith('http')).toBe(false);
  });

  it('reports a product variant without variantId with the legacy error', async () => {
    const out = await run('p', {
      links: [{ entityType: 'product-variant', id: 'x', displayText: 'V' }],
    });
    expect(out.success).toBe(false);
    expect(String(out.error)).toContain('Missing variantId');
    expect(String(out.hint)).toContain('variantId');
  });

  it('builds a variant link when both ids are given', async () => {
    const out = await run('p', {
      links: [
        {
          entityType: 'product-variant',
          id: 'x',
          variantId: '2',
          displayText: 'V',
        },
      ],
    });
    expect(out.success).toBe(true);
  });

  it('rejects an unsupported entity type at the schema', () => {
    const schema = createEntityLinkToolFactory('p').inputSchema;
    expect(
      schema.safeParse({
        links: [{ entityType: 'spaceship', id: '1', displayText: 'x' }],
      }).success
    ).toBe(false);
  });
});

describe('entity-link source', () => {
  const contexts: Array<{ dispose: () => void }> = [];
  afterEach(() => {
    while (contexts.length) contexts.pop()?.dispose();
  });

  it('injects the project key of the verified user', async () => {
    const ctx = makeToolContext({
      user: { userId: 'u1', projectKey: 'verified-project', isAdmin: false },
    });
    contexts.push(ctx);
    const registry = createToolSourceRegistry();
    registry.register(entityLinkSource);
    const { tools } = await registry.resolve(ctx);
    const execute = (
      tools.create_entity_link as unknown as {
        execute: (input: unknown) => Promise<string>;
      }
    ).execute;
    const out = JSON.parse(
      await execute({
        links: [{ entityType: 'customer', id: 'c1', displayText: 'C' }],
      })
    );
    expect(out.links[0].url.startsWith('/verified-project/')).toBe(true);
  });

  it('has no menu group and no prompt', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    expect(await entityLinkSource.listForMenu(ctx)).toBeNull();
    expect(entityLinkSource.getPrompt(ctx)).toBe('');
  });
});
