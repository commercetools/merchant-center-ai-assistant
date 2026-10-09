/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import { CACHE_NS, getCache } from '../cache';
import type { CacheStore } from '../cache';
import type { AppConfig } from '../config';
import { getContext } from '../context/request-context';
import { logger } from '../utils/logger.utils';
import { createIdentityMcpAuthProvider } from './auth-provider';
import type { IdentityAuthMode } from './auth-provider';
import { IDENTITY_TOOLS_TTL_MS } from './constants';
import {
  IdentityNoPermittedToolsError,
  IdentityReauthRequiredError,
  describeMcpFailure,
  looksLikeNoPermittedTools,
} from './errors';
import {
  identityToolsCacheKey,
  identityToolsPrefixForUser,
  isValidIdentityUserId,
} from './keys';
import type { IdentityStores } from './ports';
import type { IdentityBinding } from './types';

/**
 * Per-user tool sets from a `CommercetoolsIdentity`-mode Managed MCP Server.
 *
 * The tool objects are live closures over the MCP client and, through it, the OAuth provider
 * of ONE user: a cache entry is a handle on that user's commercetools identity, and the cache
 * stores values by reference. A mis-keyed hit would run `tools/call` as somebody else. So the
 * user is in the key AND the entry stores its owner, re-checked on every read; a key bug then
 * becomes a loud discarded entry instead of an impersonation.
 *
 * The tool names are also a snapshot of the user's Merchant Center permissions, hence the
 * short TTL. Schema normalisation for the model is the registry's job (change H), not ours.
 */

export type CreateMcpClient = typeof createMCPClient;

export interface IdentityToolSetDeps {
  config: Pick<AppConfig, 'auth' | 'ctp'>;
  stores: IdentityStores;
  cache?: CacheStore;
  /** Test seam; defaults to the SDK's `createMCPClient`. */
  createClient?: CreateMcpClient;
}

/** What the cache holds: the tools, plus who they belong to. */
interface OwnedToolSet {
  ownerUserId: string;
  ownerServerKey: string;
  ownerRevision: number;
  builtAt: number;
  tools: ToolSet;
}

export interface IdentityToolSetResult {
  tools: ToolSet;
  /** `true` when this came from the cache. */
  cached: boolean;
  toolNames: string[];
}

const LOG_PREFIX = '[mcp-identity]';

/**
 * Handshake with the identity-mode server as one user and return their tool set.
 *
 * @throws IdentityReauthRequiredError the user has no usable token (must click Connect)
 * @throws IdentityNoPermittedToolsError none of the server's tools is permitted for the user
 * @returns `null` for any other handshake failure (logged), so the caller can degrade
 */
export async function getIdentityMcpToolSet(
  userId: string,
  binding: IdentityBinding,
  deps: IdentityToolSetDeps,
  options: { mode?: IdentityAuthMode } = {}
): Promise<IdentityToolSetResult | null> {
  if (!isValidIdentityUserId(userId)) {
    throw new Error(
      'Refusing an implausible user id for an identity MCP handshake'
    );
  }
  const cache = deps.cache ?? getCache();
  const cacheKey = identityToolsCacheKey(userId, binding);
  const rid = getContext()?.requestId?.slice(0, 8) ?? '-';
  const logLine = (message: string) =>
    `${LOG_PREFIX} rid=${rid} srv=${binding.serverKey} ${message}`;

  const cached = await cache.get<OwnedToolSet>(
    CACHE_NS.MCP_IDENTITY_TOOLS,
    cacheKey
  );
  if (cached) {
    if (
      cached.ownerUserId !== userId ||
      cached.ownerServerKey !== binding.serverKey ||
      cached.ownerRevision !== binding.connectedAt
    ) {
      // Defence in depth behind the key: if this fires, key derivation is broken and one
      // user was about to act as another.
      logger.error(
        logLine(
          'TOOLS_CACHE_OWNER_MISMATCH - DISCARDING; cache-key derivation is broken and this ' +
            "request was about to run under another user's identity"
        )
      );
      await cache.delete(CACHE_NS.MCP_IDENTITY_TOOLS, cacheKey);
    } else {
      return {
        tools: cached.tools,
        cached: true,
        toolNames: Object.keys(cached.tools),
      };
    }
  }

  const provider = createIdentityMcpAuthProvider({
    config: deps.config,
    binding,
    userId,
    mode: options.mode ?? 'runtime',
    stores: deps.stores,
  });
  const startedAt = Date.now();

  try {
    const client = await (deps.createClient ?? createMCPClient)({
      transport: {
        type: 'http',
        url: binding.url,
        // No static Authorization: the provider supplies it per request.
        authProvider: provider,
        // The bearer is a USER's token: never follow a redirect that moves where it goes.
        redirect: 'error',
      },
      // commercetools' gateway answers 2025-06-18; probing the modern protocol first is a
      // wasted round trip that also makes the server log a bad request.
      protocolVersionDiscovery: false,
    });

    const tools = (await client.tools()) as ToolSet;
    const toolNames = Object.keys(tools).sort();

    await cache.set<OwnedToolSet>(
      CACHE_NS.MCP_IDENTITY_TOOLS,
      cacheKey,
      {
        ownerUserId: userId,
        ownerServerKey: binding.serverKey,
        ownerRevision: binding.connectedAt,
        builtAt: Date.now(),
        tools,
      },
      IDENTITY_TOOLS_TTL_MS
    );

    if (toolNames.length === 0) {
      logger.warn(
        logLine(
          'TOOLS_ZERO - the server answered but exposes no tools to this user. Check the ' +
            "user's Merchant Center permissions and that the server is Enabled; this is NOT " +
            'a transport failure'
        )
      );
    }
    return { tools, cached: false, toolNames };
  } catch (error) {
    const name = (error as Error | undefined)?.constructor?.name ?? 'Error';
    // The SDK's `UnauthorizedError` carries no status; the class name is what tells "the
    // user must reconnect" from "the server rejected us".
    if (name === 'UnauthorizedError') {
      logger.warn(
        logLine(`TOOLS_REAUTH_REQUIRED ms=${Date.now() - startedAt}`)
      );
      throw new IdentityReauthRequiredError(
        provider.hadNoToken ? 'no-token' : 'refresh-failed'
      );
    }
    if (looksLikeNoPermittedTools(error)) {
      logger.warn(logLine(`TOOLS_NO_PERMITTED ms=${Date.now() - startedAt}`));
      throw new IdentityNoPermittedToolsError();
    }
    logger.error(
      logLine(
        `TOOLS_HANDSHAKE_FAILED class=${name} ms=${Date.now() - startedAt} ` +
          `detail=${describeMcpFailure(error)}`
      )
    );
    return null;
  }
}

/** Drop every cached identity tool set of one user. */
export async function invalidateToolSetsForUser(
  userId: string,
  cache: CacheStore = getCache()
): Promise<void> {
  await cache.deletePrefix(
    CACHE_NS.MCP_IDENTITY_TOOLS,
    identityToolsPrefixForUser(userId)
  );
}

/** Drop every cached identity tool set (bind / unbind). */
export async function invalidateAllToolSets(
  cache: CacheStore = getCache()
): Promise<void> {
  await cache.clearNamespace(CACHE_NS.MCP_IDENTITY_TOOLS);
}

/**
 * Invoke one tool as one user. Re-resolves the tool set through the owner-checked path on
 * purpose: a caller can never hand in a tool set obtained for somebody else.
 */
export async function callIdentityMcpTool(
  userId: string,
  binding: IdentityBinding,
  deps: IdentityToolSetDeps,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result: unknown; ms: number }> {
  const resolved = await getIdentityMcpToolSet(userId, binding, deps);
  if (!resolved) {
    throw new Error('No identity-mode tool set is available for this user');
  }
  const tool = resolved.tools[toolName] as
    | { execute?: (input: unknown, ctx: unknown) => Promise<unknown> }
    | undefined;
  if (!tool?.execute) {
    throw new Error(
      `Tool ${toolName} is not exposed to this user. Available: ${
        resolved.toolNames.join(', ') || '(none)'
      }`
    );
  }
  const startedAt = Date.now();
  try {
    const result = await tool.execute(args, {});
    return { result, ms: Date.now() - startedAt };
  } catch (error) {
    logger.error(
      `${LOG_PREFIX} srv=${binding.serverKey} CALL_ERR tool=${toolName} ms=${
        Date.now() - startedAt
      } class=${(error as Error | undefined)?.constructor?.name ?? 'Error'}`
    );
    throw error;
  }
}
