/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { probeIdentityMcp } from '../../src/identity-mcp/discovery';
import { AS_ORIGIN, MCP_URL, REGION } from './helpers';

const PRM_URL = `https://mcp.${REGION}.commercetools.com/.well-known/oauth-protected-resource/projects/p/s`;
const CT_AUTH = `https://auth.${REGION}.commercetools.com`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface Plan {
  mcp?: () => Response;
  prm?: () => Response;
  asMetadata?: (origin: string) => Response;
  register?: () => Response;
}

/** Stubs global fetch with a routing table; returns the list of requested URLs. */
function stubFetch(plan: Plan): string[] {
  const seen: string[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === MCP_URL) {
      return (
        plan.mcp?.() ??
        new Response('{}', {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${PRM_URL}"`,
          },
        })
      );
    }
    if (url === PRM_URL)
      return plan.prm?.() ?? new Response('x', { status: 404 });
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return (
        plan.asMetadata?.(new URL(url).origin) ??
        new Response('x', { status: 404 })
      );
    }
    if (url.endsWith('/oauth2/register')) {
      return (
        plan.register?.() ?? json({ error: 'invalid_client_metadata' }, 400)
      );
    }
    return new Response('x', { status: 404 });
  });
  return seen;
}

const asMetadata = (origin: string) =>
  json({
    issuer: origin,
    registration_endpoint: `${origin}/oauth2/register`,
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
  });

afterEach(() => jest.restoreAllMocks());

describe('probeIdentityMcp', () => {
  it('401 plus metadata naming auth2 -> verdict auth2, registration reachable', async () => {
    stubFetch({
      prm: () =>
        json({ resource: MCP_URL, authorization_servers: [AS_ORIGIN] }),
      asMetadata,
    });
    const r = await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    expect(r.verdict).toBe('auth2');
    expect(r.problems).toEqual([]);
    expect(r.dcrReachable).toBe(true);
    expect(r.challengeStatus).toBe(401);
  });

  it('metadata naming the auth. host -> client-credentials-as, with a problem entry', async () => {
    stubFetch({
      prm: () => json({ resource: MCP_URL, authorization_servers: [CT_AUTH] }),
      asMetadata,
    });
    const r = await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    expect(r.verdict).toBe('client-credentials-as');
    expect(r.problems.join(' ')).toMatch(/ClientCredentials/);
  });

  it('a 200 instead of 401 is reported as a problem and never throws', async () => {
    stubFetch({ mcp: () => new Response('{}', { status: 200 }) });
    const r = await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    expect(r.problems.some((p) => p.includes('expected 401'))).toBe(true);
    expect(r.verdict).toBe('no-metadata');
  });

  it('refuses a cross-origin resource_metadata URL without fetching it', async () => {
    const seen = stubFetch({
      mcp: () =>
        new Response('{}', {
          status: 401,
          headers: {
            'www-authenticate':
              'Bearer resource_metadata="https://evil.example/prm"',
          },
        }),
    });
    const r = await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    expect(r.problems.some((p) => p.includes('cross-origin'))).toBe(true);
    expect(seen.some((s) => s.includes('evil.example'))).toBe(false);
  });

  it('never sends credentials and never follows redirects', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('x', { status: 404 }));
    await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.redirect).toBe('manual');
      expect(JSON.stringify(init?.headers ?? {}).toLowerCase()).not.toContain(
        'authorization"'
      );
    }
  });

  it('a network failure becomes a problem entry', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const r = await probeIdentityMcp({ apiRegion: REGION, mcpUrl: MCP_URL });
    expect(r.verdict).toBe('no-metadata');
    expect(r.problems.some((p) => p.includes('offline'))).toBe(true);
  });
});
