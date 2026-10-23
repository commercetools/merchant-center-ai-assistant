/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import readline from 'node:readline';
import type { Log } from '../utils/log.types';
import { CHILD_NODE_OPTIONS, SPAWN_TIMEOUT_MS } from './constants';
import { NimbusTransport } from './transport';

/** One spawned child with its connected AI SDK client (a "generation"). */
export interface Upstream {
  generation: number;
  client: MCPClient;
  transport: NimbusTransport;
  /** The tools as the AI SDK client built them; valid only while this generation lives. */
  tools: ToolSet;
}

export interface ConnectOptions {
  generation: number;
  entry: string;
  command: string;
  log: Log;
  /** Extra environment for the child (tests only); never the service environment. */
  extraEnv?: Record<string, string>;
  spawnTimeoutMs?: number;
  /** Called when the child's stdio closes (not necessarily when the process exited). */
  onChildClose: () => void;
}

/**
 * Spawns `node <entry>`, completes the MCP handshake and lists the tools. On any failure the
 * child is stopped before the error is rethrown.
 */
export const connectNimbus = async (
  options: ConnectOptions
): Promise<Upstream> => {
  const { generation, log } = options;
  const transport = new NimbusTransport(
    {
      command: options.command,
      args: [options.entry],
      env: { ...options.extraEnv, NODE_OPTIONS: CHILD_NODE_OPTIONS },
    },
    options.onChildClose
  );

  // Attached before start so the child's first lines are not lost.
  if (transport.stderr) {
    readline
      .createInterface({ input: transport.stderr })
      .on('line', (line) =>
        log.warn('nimbus-mcp stderr', { source: 'nimbus-mcp', line, generation })
      );
  }

  let client: MCPClient | undefined;
  try {
    client = await createMCPClient({
      transport,
      name: 'ai-assistant-nimbus',
      initializationOptions: {
        timeout: options.spawnTimeoutMs ?? SPAWN_TIMEOUT_MS,
      },
      onUncaughtError: (error) =>
        log.warn('nimbus-mcp client error', {
          source: 'nimbus-mcp',
          generation,
          error: error instanceof Error ? error.message : String(error),
        }),
    });
    const tools = (await client.tools()) as ToolSet;
    return { generation, client, transport, tools };
  } catch (error) {
    // `onclose` fires when stdio closes, which is not the same as the process having exited:
    // closing explicitly is the only thing that reaps the child.
    await (client ? client.close() : transport.close()).catch(() => undefined);
    throw error;
  }
};
