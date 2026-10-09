/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  baseUrlFor,
  CONTENTSTACK_BASE_URLS,
  ContentstackClient,
} from '../../src/tool-sources/contentstack/client';

const recordingFetch = () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  };
  return { calls, fetchImpl };
};

describe('ContentstackClient', () => {
  it.each([
    ['na', 'https://api.contentstack.io/v3'],
    ['eu', 'https://eu-api.contentstack.com/v3'],
    ['au', 'https://au-api.contentstack.com/v3'],
    ['azure-na', 'https://azure-na-api.contentstack.com/v3'],
    ['azure-eu', 'https://azure-eu-api.contentstack.com/v3'],
    ['gcp-na', 'https://gcp-na-api.contentstack.com/v3'],
    ['gcp-eu', 'https://gcp-eu-api.contentstack.com/v3'],
  ])('region %s -> %s', (region, url) => {
    expect(baseUrlFor(region)).toBe(url);
    expect(
      new ContentstackClient({ apiKey: 'a', managementToken: 'b', region })
        .apiBaseUrl
    ).toBe(url);
  });

  it('covers every region the validator accepts and defaults to na', () => {
    expect(Object.keys(CONTENTSTACK_BASE_URLS)).toHaveLength(7);
    expect(
      new ContentstackClient({ apiKey: 'a', managementToken: 'b' }).apiBaseUrl
    ).toBe('https://api.contentstack.io/v3');
  });

  it('sends api_key and authorization, and branch only when set', async () => {
    const { calls, fetchImpl } = recordingFetch();
    const plain = new ContentstackClient({
      apiKey: 'KEY',
      managementToken: 'TOKEN',
      fetchImpl,
    });
    await plain.fetch('https://x.test/1', { headers: plain.headers });
    expect(plain.headers).toMatchObject({
      api_key: 'KEY',
      authorization: 'TOKEN',
    });
    expect(plain.headers.branch).toBeUndefined();

    const branched = new ContentstackClient({
      apiKey: 'KEY',
      managementToken: 'TOKEN',
      branch: 'dev',
      fetchImpl,
    });
    expect(branched.headers.branch).toBe('dev');
    expect(calls).toHaveLength(1);
  });

  it('adds a request timeout signal unless one is given', async () => {
    const { calls, fetchImpl } = recordingFetch();
    const client = new ContentstackClient({
      apiKey: 'a',
      managementToken: 'b',
      fetchImpl,
    });
    await client.fetch('https://x.test/1');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('422 with a JSON error: text starts "API Error: 422 -" and holds no header value', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error_message: 'Bad schema',
          errors: { title: ['required'] },
        }),
        {
          status: 422,
        }
      );
    const client = new ContentstackClient({
      apiKey: 'SENTINEL-key',
      managementToken: 'SENTINEL-token',
      fetchImpl,
    });
    const response = await client.fetch('https://x.test/1', {
      headers: client.headers,
    });
    const text = client.handleError(await client.toApiError(response));
    expect(text.startsWith('API Error: 422 -')).toBe(true);
    expect(text).toContain('Bad schema');
    expect(text).not.toContain('SENTINEL');
  });

  it('a non-JSON error body still yields an API Error line', async () => {
    const client = new ContentstackClient({
      apiKey: 'a',
      managementToken: 'b',
      fetchImpl: async () => new Response('<html>', { status: 502 }),
    });
    const response = await client.fetch('https://x.test/1');
    expect(client.handleError(await client.toApiError(response))).toMatch(
      /^API Error: 502 - /
    );
  });

  it('handleError covers the other shapes', () => {
    const client = new ContentstackClient({
      apiKey: 'a',
      managementToken: 'b',
    });
    expect(client.handleError(Object.assign(new Error('boom'), {}))).toBe(
      'Error: boom'
    );
    expect(
      client.handleError(
        Object.assign(new Error('x'), { error_message: 'm', errors: { a: 1 } })
      )
    ).toBe('Error: m - {"a":1}');
    expect(
      client.handleError(Object.assign(new Error('x'), { request: {} }))
    ).toBe('No response received from Contentstack');
  });
});
