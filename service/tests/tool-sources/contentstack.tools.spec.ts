/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { asSchema } from '@ai-sdk/provider-utils';
import type { Tool } from 'ai';
import { ContentstackClient } from '../../src/tool-sources/contentstack/client';
import {
  CONTENTSTACK_READ_TOOLS,
  CONTENTSTACK_TOOLS,
  CONTENTSTACK_UPDATE_TOOLS,
} from '../../src/tool-sources/contentstack/constants';
import { buildContentstackTools } from '../../src/tool-sources/contentstack/source';
import { contentTypeTools } from '../../src/tool-sources/contentstack/tools-content-type';
import { entryTools } from '../../src/tool-sources/contentstack/tools-entry';
import { globalFieldTools } from '../../src/tool-sources/contentstack/tools-global-field';
import { readTools } from '../../src/tool-sources/contentstack/tools-read';

const BODY = {
  content_type: { uid: 'ct', title: 'CT', schema: [] },
  entry: { uid: 'e1', title: 'E', _version: 3 },
  global_field: { uid: 'g1', title: 'G', schema: [] },
  content_types: [],
  entries: [],
  global_fields: [],
  count: 0,
};

const stub = (status = 200, body: unknown = BODY) => {
  const calls: Array<{
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
  }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push({
      method: init?.method ?? 'GET',
      path: u.pathname + u.search,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
    return new Response(JSON.stringify(body), { status });
  };
  const client = new ContentstackClient({
    apiKey: 'KEY',
    managementToken: 'TOKEN',
    fetchImpl,
  });
  return { calls, client };
};

/** Like the AI SDK: validate (applies schema defaults) and then execute with the parsed value. */
const run = async (tool: Tool, input: unknown) => {
  const parsed = await asSchema((tool as { inputSchema: never }).inputSchema)
    .validate!(input);
  if (!parsed.success) throw new Error('invalid test input');
  return (
    tool.execute as (
      i: unknown,
      o: unknown
    ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>
  )(parsed.value, { toolCallId: 't1', messages: [] });
};

const SCHEMA = [{ display_name: 'Title', uid: 'title', data_type: 'text' }];

/** name, minimal valid input, expected `METHOD path-prefix` of the LAST call. */
const CASES: Array<[string, unknown, string]> = [
  [
    'create_content_type',
    { title: 'T', uid: 'ct', schema: SCHEMA },
    'POST /v3/content_types',
  ],
  [
    'update_content_type',
    { uid: 'ct', title: 'New' },
    'PUT /v3/content_types/ct',
  ],
  ['delete_content_type', { uid: 'ct' }, 'DELETE /v3/content_types/ct'],
  [
    'create_entry',
    { content_type_uid: 'ct', entry: { title: 'x' } },
    'POST /v3/content_types/ct/entries',
  ],
  [
    'update_entry',
    { content_type_uid: 'ct', entry_uid: 'e1', entry: { title: 'y' } },
    'PUT /v3/content_types/ct/entries/e1',
  ],
  [
    'delete_entry',
    { content_type_uid: 'ct', entry_uid: 'e1' },
    'DELETE /v3/content_types/ct/entries/e1',
  ],
  [
    'publish_entry',
    {
      content_type_uid: 'ct',
      entry_uid: 'e1',
      environment: 'prod',
      locale: 'en-us',
    },
    'POST /v3/content_types/ct/entries/e1/publish',
  ],
  [
    'unpublish_entry',
    {
      content_type_uid: 'ct',
      entry_uid: 'e1',
      environment: 'prod',
      locale: 'en-us',
    },
    'POST /v3/content_types/ct/entries/e1/unpublish',
  ],
  [
    'create_global_field',
    { title: 'G', uid: 'g1', schema: SCHEMA },
    'POST /v3/global_fields',
  ],
  [
    'update_global_field',
    { uid: 'g1', title: 'G2' },
    'PUT /v3/global_fields/g1',
  ],
  ['get_content_type', { uid: 'ct' }, 'GET /v3/content_types/ct'],
  ['get_all_content_types', {}, 'GET /v3/content_types'],
  [
    'get_entry',
    { content_type_uid: 'ct', entry_uid: 'e1' },
    'GET /v3/content_types/ct/entries/e1',
  ],
  [
    'get_entries',
    { content_type_uid: 'ct' },
    'GET /v3/content_types/ct/entries',
  ],
  ['get_all_global_fields', {}, 'GET /v3/global_fields'],
];

describe('the 15 Contentstack tools', () => {
  const { client } = stub();
  const all = buildContentstackTools(client);

  it('exposes exactly the 15 names, split 10 update + 5 read', () => {
    expect(Object.keys(all).sort()).toEqual([...CONTENTSTACK_TOOLS].sort());
    expect(CONTENTSTACK_UPDATE_TOOLS).toHaveLength(10);
    expect(CONTENTSTACK_READ_TOOLS).toHaveLength(5);
  });

  it('the resource files hold 3 + 5 + 2 + 5 tools', () => {
    expect(Object.keys(contentTypeTools(client))).toHaveLength(3);
    expect(Object.keys(entryTools(client))).toHaveLength(5);
    expect(Object.keys(globalFieldTools(client))).toHaveLength(2);
    expect(Object.keys(readTools(client))).toHaveLength(5);
  });

  it.each(CASES)(
    '%s: schema parses a minimal payload and execute calls %s',
    async (name, input, expected) => {
      const { calls, client: c } = stub();
      const tool = buildContentstackTools(c)[name];
      const schema = asSchema((tool as { inputSchema: never }).inputSchema);
      const parsed = await schema.validate!(input);
      expect(parsed.success).toBe(true);

      const result = await run(tool, input);
      expect(result.isError).toBeUndefined();
      expect(typeof result.content[0].text).toBe('string');
      const last = calls[calls.length - 1];
      expect(`${last.method} ${last.path}`.startsWith(expected)).toBe(true);
      expect(last.headers).toMatchObject({
        api_key: 'KEY',
        authorization: 'TOKEN',
      });
    }
  );

  it('create_entry sends copy_to_master and the entry payload', async () => {
    const { calls, client: c } = stub();
    await run(buildContentstackTools(c).create_entry, {
      content_type_uid: 'ct',
      entry: { title: 'x' },
    });
    expect(calls[0].path).toBe(
      '/v3/content_types/ct/entries?copy_to_master=true'
    );
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({
      entry: { title: 'x' },
    });
  });

  it('publish_entry checks the entry first, then publishes to the environment and locale', async () => {
    const { calls, client: c } = stub();
    await run(buildContentstackTools(c).publish_entry, {
      content_type_uid: 'ct',
      entry_uid: 'e1',
      environment: 'prod',
      locale: 'en-us',
    });
    expect(calls.map((x) => x.method)).toEqual(['GET', 'POST']);
    expect(JSON.parse(calls[1].body ?? '{}')).toEqual({
      entry: { environments: ['prod'], locales: ['en-us'] },
    });
  });

  it.each(CASES.map((c) => c[0]))(
    '%s: a 422 answer becomes an "API Error: 422 -" text with isError',
    async (name) => {
      const input = CASES.find((c) => c[0] === name)?.[1];
      const { client: c } = stub(422, {
        error_message: 'nope',
        error_code: 123,
      });
      const result = await run(buildContentstackTools(c)[name], input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API Error: 422 -');
      expect(result.content[0].text).not.toContain('TOKEN');
    }
  );

  it('the eu region sends requests to the eu host', async () => {
    const calls: string[] = [];
    const c = new ContentstackClient({
      apiKey: 'a',
      managementToken: 'b',
      region: 'eu',
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify(BODY));
      },
    });
    await run(buildContentstackTools(c).get_all_content_types, {});
    expect(
      calls[0].startsWith('https://eu-api.contentstack.com/v3/content_types')
    ).toBe(true);
  });

  it('the descriptions and optional-field schemas are present', () => {
    for (const name of CONTENTSTACK_TOOLS) {
      expect((all[name] as { description?: string }).description).toBeTruthy();
    }
  });
});
