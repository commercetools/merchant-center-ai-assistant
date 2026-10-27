/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import type { Log } from '../utils/log.types';

export interface Readiness {
  status: 'ok' | 'degraded' | 'error' | 'disabled';
  /** Version of the running `@commercetools/nimbus-mcp` (absent when it is not installed). */
  nimbusMcp?: string;
  /** Number of tools served. */
  tools?: number;
  toolNames?: string[];
  /** Expected tools the child does not serve (`degraded`). */
  missing?: string[];
  /** Why the status is `error`. */
  reason?: string;
}

/**
 * Where the Nimbus tools come from. The embedded child process is the only implementation
 * today; a separate HTTP gateway would be a second one. Free of any
 * stdio concept on purpose.
 */
export interface NimbusBackend {
  /**
   * The AI SDK tools of the CURRENT generation, exactly as the server serves them (including
   * `get_component`). Every `execute` resolves the live generation when it is called.
   */
  tools(): Promise<ToolSet>;
  /** Never throws. */
  readiness(): Promise<Readiness>;
  /** Stops everything; no respawn afterwards. */
  close(): Promise<void>;
}

/** `NIMBUS_MCP_ENABLED=false`: nothing is ever spawned. */
export class DisabledNimbusBackend implements NimbusBackend {
  async tools(): Promise<ToolSet> {
    return {};
  }
  async readiness(): Promise<Readiness> {
    return { status: 'disabled' };
  }
  async close(): Promise<void> {
    /* nothing to stop */
  }
}

/** The package is not on disk: the service keeps serving without Nimbus tools. */
export class UnavailableNimbusBackend implements NimbusBackend {
  private logged = false;

  constructor(
    private readonly reason: string,
    private readonly log: Log
  ) {}

  private report(): void {
    if (this.logged) return;
    this.logged = true;
    this.log.warn('nimbus-mcp unavailable', { reason: this.reason });
  }

  async tools(): Promise<ToolSet> {
    this.report();
    return {};
  }
  async readiness(): Promise<Readiness> {
    this.report();
    return { status: 'error', reason: this.reason };
  }
  async close(): Promise<void> {
    /* nothing to stop */
  }
}
