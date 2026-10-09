/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import type { McpClientFactory } from '../../src/tool-sources/mcp-tools';

/** Installed for every test (tests/setup.ts): no test may reach a real MCP server. */
export const offlineMcpFactory: McpClientFactory = async () => {
  throw new Error('network disabled in tests');
};

/** A fake MCP client serving fixed tools and prompts; records the transport config. */
export const fakeMcpFactory = (o: {
  tools?: ToolSet;
  prompts?: Record<string, string>;
  failTools?: Error;
  toolsDelayMs?: number;
}): McpClientFactory & {
  configs: Array<{
    url: string;
    redirect: string;
    headers?: Record<string, string>;
  }>;
  closed: number;
} => {
  const configs: Array<{
    url: string;
    redirect: string;
    headers?: Record<string, string>;
  }> = [];
  const state = { closed: 0 };
  const factory: McpClientFactory = async (config) => {
    configs.push({
      url: config.url,
      redirect: config.redirect,
      headers: config.headers,
    });
    return {
      tools: async () => {
        if (o.toolsDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, o.toolsDelayMs));
        }
        if (o.failTools) throw o.failTools;
        return o.tools ?? {};
      },
      experimental_getPrompt: async ({ name }) => {
        const text = o.prompts?.[name];
        if (text === undefined) throw new Error('no such prompt');
        return { messages: [{ content: { type: 'text', text } }] };
      },
      close: async () => {
        state.closed += 1;
      },
    };
  };
  Object.defineProperty(factory, 'closed', { get: () => state.closed });
  return Object.assign(factory, { configs }) as ReturnType<
    typeof fakeMcpFactory
  >;
};
