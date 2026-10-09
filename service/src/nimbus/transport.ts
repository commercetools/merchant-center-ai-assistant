/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { MCPTransport } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Readable } from 'node:stream';

type SdkMessage = Parameters<StdioClientTransport['send']>[0];
type AiSdkMessage = Parameters<MCPTransport['send']>[0];

export interface NimbusTransportParams {
  command: string;
  args: string[];
  /** Added to the SDK's safe default environment (PATH, HOME, ...); nothing else is inherited. */
  env: Record<string, string>;
}

/**
 * Hands the MCP SDK stdio transport to the AI SDK `createMCPClient` while keeping the child's
 * stderr readable: the AI SDK's own stdio transport can only inherit or ignore stderr, which
 * would put child output into Connect logs as unstructured text.
 *
 * The AI SDK client assigns `onclose` / `onerror` / `onmessage` after construction; they are
 * plain properties here and forwarded from the inner transport. `onChildClose` is the
 * manager's own hook and fires first, so a respawn never depends on the client's handler.
 */
export class NimbusTransport implements MCPTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: AiSdkMessage) => void;

  private readonly inner: StdioClientTransport;

  constructor(
    params: NimbusTransportParams,
    private readonly onChildClose: () => void
  ) {
    this.inner = new StdioClientTransport({
      command: params.command,
      args: params.args,
      env: params.env,
      // Piped, never inherited: stderr must not get anywhere near the JSON-RPC stream.
      stderr: 'pipe',
    });
    this.inner.onclose = () => {
      this.onChildClose();
      this.onclose?.();
    };
    this.inner.onerror = (error) => this.onerror?.(error);
    // The two packages carry structurally different `JSONRPCMessage` types (different
    // generations of the same schema); the wire format is identical, hence the casts.
    this.inner.onmessage = (message) =>
      this.onmessage?.(message as unknown as AiSdkMessage);
  }

  /** The child's stderr (available before `start`, so no early line is lost). */
  get stderr(): Readable | null {
    return this.inner.stderr as Readable | null;
  }

  get pid(): number | null {
    return this.inner.pid;
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  send(message: AiSdkMessage): Promise<void> {
    return this.inner.send(message as unknown as SdkMessage);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
