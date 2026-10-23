/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolExecutionOptions, ToolSet } from 'ai';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NimbusProcessManager } from '../../src/nimbus/process-manager';
import type { Log } from '../../src/utils/log.types';

export const FAKE_NIMBUS = path.resolve(
  process.cwd(),
  'tests/nimbus/fixtures/fake-nimbus.mjs'
);

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: unknown;
}

export const recordingLog = (): Log & { entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  const at =
    (level: LogEntry['level']) =>
    (message: string, meta?: unknown): void => {
      entries.push({ level, message, meta });
    };
  return {
    entries,
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
  };
};

export const pidFile = (): string =>
  path.join(mkdtempSync(path.join(tmpdir(), 'fake-nimbus-')), 'pids.txt');

/** Every pid the fixture appended to `file`. */
export const startedPids = (file: string): number[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(Number)
    : [];

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const waitFor = async (
  condition: () => boolean,
  timeoutMs = 5_000
): Promise<void> => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

export const makeManager = (
  extra: Partial<ConstructorParameters<typeof NimbusProcessManager>[0]> = {}
) => {
  const log = recordingLog();
  const pids = pidFile();
  const manager = new NimbusProcessManager({
    entry: FAKE_NIMBUS,
    version: '9.9.9-test',
    log,
    extraEnv: { FAKE_NIMBUS_PID_FILE: pids },
    ...extra,
  });
  return { manager, log, pids };
};

const OPTIONS: ToolExecutionOptions<unknown> = {
  toolCallId: 't1',
  messages: [],
  context: undefined,
};

/** Calls `name` on a tool set like the AI SDK would. */
export const callTool = async (
  tools: ToolSet,
  name: string,
  args: Record<string, unknown>,
  options: Partial<ToolExecutionOptions<unknown>> = {}
): Promise<unknown> => {
  const execute = tools[name]?.execute;
  if (!execute) throw new Error(`no tool ${name}`);
  return execute(args, { ...OPTIONS, ...options });
};

export const textOf = (result: unknown): string =>
  (result as { content: Array<{ text: string }> }).content[0].text;
