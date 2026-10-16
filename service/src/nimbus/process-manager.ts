/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool, ToolExecutionOptions, ToolSet } from 'ai';
import type { Log } from '../utils/log.types';
import type { NimbusBackend, Readiness } from './backend';
import { connectNimbus, type Upstream } from './client';
import {
  CALL_TIMEOUT_MS,
  IDLE_SHUTDOWN_MS,
  RECYCLE_AFTER_TIMEOUTS,
} from './constants';
import { createReadiness } from './readiness';

export interface NimbusProcessManagerOptions {
  /** Absolute path of the package's `dist/index.js`. */
  entry: string;
  version: string;
  log: Log;
  /** Defaults to the running Node (`process.execPath`). */
  command?: string;
  /** Test knobs. */
  extraEnv?: Record<string, string>;
  callTimeoutMs?: number;
  idleShutdownMs?: number;
  spawnTimeoutMs?: number;
}

/**
 * The one long-lived `@commercetools/nimbus-mcp` child of this service instance.
 *
 * The package is stdio-only and cannot be imported (no `exports.require`, no exported
 * server factory), so it is spawned. One child serves all requests: the MCP client
 * multiplexes JSON-RPC ids. Spawned lazily, respawned after it closes, recycled after
 * `RECYCLE_AFTER_TIMEOUTS` consecutive call timeouts (a wedged child never closes stdio, so
 * `onclose` cannot see it), stopped after an idle period and with the service.
 */
export class NimbusProcessManager implements NimbusBackend {
  private generation = 0;
  private current: Upstream | null = null;
  private starting: Promise<Upstream> | null = null;
  private timeouts = 0;
  private idleTimer: NodeJS.Timeout | undefined;
  private shutDown = false;

  private readonly callTimeoutMs: number;
  private readonly idleShutdownMs: number;
  private readonly checkReadiness: () => Promise<Readiness>;

  constructor(private readonly opts: NimbusProcessManagerOptions) {
    this.callTimeoutMs = opts.callTimeoutMs ?? CALL_TIMEOUT_MS;
    this.idleShutdownMs = opts.idleShutdownMs ?? IDLE_SHUTDOWN_MS;
    this.checkReadiness = createReadiness({
      version: opts.version,
      log: opts.log,
      listToolNames: async () => {
        const up = await this.getUpstream();
        this.touch();
        const listed = await up.client.listTools({
          options: { timeout: this.callTimeoutMs },
        });
        return listed.tools.map((t) => t.name);
      },
    });
  }

  /** The live upstream, spawning it when needed. Concurrent first callers share one start. */
  async getUpstream(): Promise<Upstream> {
    if (this.shutDown) throw new Error('nimbus-mcp manager is shut down');
    if (this.current) return this.current;
    this.starting ??= this.spawn()
      .then((up) => {
        this.current = up;
        return up;
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  /** PID of the live child (diagnostics and tests). */
  get pid(): number | null {
    return this.current?.transport.pid ?? null;
  }

  private async spawn(): Promise<Upstream> {
    const generation = ++this.generation;
    const holder: { up?: Upstream } = {};
    const up = await connectNimbus({
      generation,
      entry: this.opts.entry,
      command: this.opts.command ?? process.execPath,
      log: this.opts.log,
      extraEnv: this.opts.extraEnv,
      spawnTimeoutMs: this.opts.spawnTimeoutMs,
      onChildClose: () => this.onChildClosed(holder.up),
    });
    holder.up = up;
    this.opts.log.info('nimbus-mcp connected', {
      generation,
      nimbusMcp: this.opts.version,
      tools: Object.keys(up.tools).length,
    });
    return up;
  }

  /** Stdio of a child closed. Late callbacks of an old generation are ignored. */
  private onChildClosed(up: Upstream | undefined): void {
    if (!up || this.current !== up) return;
    this.opts.log.warn('nimbus-mcp stdio closed; respawning on next request', {
      generation: up.generation,
    });
    this.current = null;
    this.timeouts = 0;
    this.clearIdle();
    // `onclose` fires when stdio closes, which is not the same as the process having exited;
    // closing the client is what reaps it.
    up.client.close().catch(() => undefined);
  }

  /** Stops the child on purpose; the next call respawns it. */
  async recycle(why: string): Promise<void> {
    const up = this.current;
    this.current = null;
    this.timeouts = 0;
    this.clearIdle();
    if (up) {
      this.opts.log.warn('recycling upstream', { why, generation: up.generation });
      await up.client.close().catch(() => undefined);
    }
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /** Every call and readiness check restarts the idle countdown. */
  private touch(): void {
    this.clearIdle();
    if (!this.current) return;
    this.idleTimer = setTimeout(() => {
      this.opts.log.info('nimbus-mcp idle; shutting the child down');
      void this.recycleQuietly();
    }, this.idleShutdownMs);
    this.idleTimer.unref();
  }

  private async recycleQuietly(): Promise<void> {
    const up = this.current;
    this.current = null;
    this.timeouts = 0;
    this.clearIdle();
    if (up) await up.client.close().catch(() => undefined);
  }

  async tools(): Promise<ToolSet> {
    const up = await this.getUpstream();
    this.touch();
    const out: ToolSet = {};
    for (const [name, served] of Object.entries(up.tools)) {
      out[name] = this.delegating(name, served);
    }
    return out;
  }

  /**
   * A copy of the served tool whose `execute` resolves the live generation at call time, so a
   * turn that started before a respawn never calls a closed client.
   */
  private delegating(name: string, served: Tool): Tool {
    return {
      ...served,
      execute: (input: unknown, options: ToolExecutionOptions<unknown>) =>
        this.callThrough(name, input, options),
    } as Tool;
  }

  private async callThrough(
    name: string,
    input: unknown,
    options: ToolExecutionOptions<unknown>
  ): Promise<unknown> {
    const up = await this.getUpstream();
    this.touch();
    const execute = up.tools[name]?.execute;
    if (!execute) throw new Error(`Nimbus tool "${name}" is not available`);

    const timeoutSignal = AbortSignal.timeout(this.callTimeoutMs);
    const abortSignal = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, timeoutSignal])
      : timeoutSignal;
    try {
      const result = await execute(input, { ...options, abortSignal });
      if (this.current === up) this.timeouts = 0;
      return result;
    } catch (error) {
      // Our own timeout, not the caller giving up.
      if (timeoutSignal.aborted && !options?.abortSignal?.aborted) {
        await this.onCallTimeout(up);
      }
      throw error;
    }
  }

  private async onCallTimeout(up: Upstream): Promise<void> {
    if (this.current !== up) return;
    this.timeouts += 1;
    if (this.timeouts >= RECYCLE_AFTER_TIMEOUTS) {
      await this.recycle(`${this.timeouts} consecutive upstream timeouts`);
    }
  }

  readiness(): Promise<Readiness> {
    return this.checkReadiness();
  }

  /** Service shutdown: stops the child and refuses to respawn. */
  async close(): Promise<void> {
    this.shutDown = true;
    if (this.starting) await this.starting.catch(() => undefined);
    await this.recycleQuietly();
  }
}
