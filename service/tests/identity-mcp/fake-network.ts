/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { AS_ORIGIN, MCP_URL, REGION, fakeAuth2 } from './helpers';
import type { FakeAuth2 } from './helpers';

export type Responder = (
  url: URL,
  init: RequestInit | undefined
) => Response | Promise<Response | undefined> | undefined;

const PRM_PATH =
  '/.well-known/oauth-protected-resource/projects/p/ai-assistant-identity';

export interface FakeMcpOptions {
  /** Tool names answered by `tools/list`. */
  tools?: string[];
  /** Bearer values the server accepts; everything else gets the 401 challenge. */
  acceptToken?: (token: string) => boolean;
  /** Overrides the answer to an authorised `tools/list` (for example a 403). */
  toolsListResponse?: () => Response;
}

export interface FakeMcp {
  responder: Responder;
  requests: Array<{ method: string; bearer?: string }>;
  count: (method: string) => number;
}

const rpc = (id: unknown, result: unknown): Response =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** An identity-mode Managed MCP Server: 401 challenge, initialize, tools/list. */
export function fakeMcp(o: FakeMcpOptions = {}): FakeMcp {
  const requests: FakeMcp['requests'] = [];
  const accept = o.acceptToken ?? (() => true);
  const tools = o.tools ?? ['read_orders', 'update_orders'];

  const responder: Responder = async (url, init) => {
    if (url.href === `https://mcp.${REGION}.commercetools.com${PRM_PATH}`) {
      return new Response(
        JSON.stringify({
          resource: MCP_URL,
          authorization_servers: [AS_ORIGIN],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.href !== MCP_URL) return undefined;
    if (init?.method === 'GET' || init?.method === 'DELETE') {
      return new Response('', { status: 405 });
    }
    const headers = new Headers(init?.headers);
    const auth = headers.get('authorization') ?? undefined;
    const bearer = auth?.replace(/^Bearer /i, '');
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      id?: unknown;
      method?: string;
    };
    requests.push({ method: body.method ?? '?', bearer });

    if (!bearer || !accept(bearer)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'This endpoint requires an access token',
          },
        }),
        {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'www-authenticate': `Bearer resource_metadata="https://mcp.${REGION}.commercetools.com${PRM_PATH}"`,
          },
        }
      );
    }
    if (body.method === 'initialize') {
      return rpc(body.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-ct-mcp', version: '1' },
      });
    }
    if (body.method === 'notifications/initialized')
      return new Response('', { status: 202 });
    if (body.method === 'tools/list') {
      if (o.toolsListResponse) return o.toolsListResponse();
      return rpc(body.id, {
        tools: tools.map((name) => ({
          name,
          description: `${name} tool`,
          inputSchema: { type: 'object', properties: {} },
        })),
      });
    }
    return rpc(body.id, {});
  };

  return {
    responder,
    requests,
    count: (method) => requests.filter((r) => r.method === method).length,
  };
}

/** The auth2 routes of {@link fakeAuth2} as a responder. */
export const auth2Responder =
  (fake: FakeAuth2): Responder =>
  (url, init) => {
    if (
      url.origin === AS_ORIGIN ||
      url.pathname.startsWith('/.well-known/oauth-protected-resource')
    ) {
      return fake.fetchFn(url.href, init);
    }
    return undefined;
  };

export interface InstalledFetch {
  calls: string[];
  restore: () => void;
}

/** Replaces `fetch` with the first responder that answers; unanswered requests are 404. */
export function installFetch(...responders: Responder[]): InstalledFetch {
  const calls: string[] = [];
  const spy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(`${init?.method ?? 'GET'} ${url.href}`);
      for (const responder of responders) {
        const response = await responder(url, init);
        if (response) return response;
      }
      return new Response('not found', { status: 404 });
    });
  return { calls, restore: () => spy.mockRestore() };
}

export interface RoutedFetch {
  fetchFn: typeof fetch;
  calls: string[];
}

/** A `fetch` that answers from the responders (first match); everything else is 404. */
export function routedFetch(...responders: Responder[]): RoutedFetch {
  const calls: string[] = [];
  const fetchFn = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.href}`);
    for (const responder of responders) {
      const response = await responder(url, init);
      if (response) return response;
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}
