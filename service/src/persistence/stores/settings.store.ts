/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { SKIP, updateWithRetry } from '../gateway/cas';
import { ValidationError } from '../gateway/errors';
import {
  DEFAULT_SETTINGS,
  Settings,
  settingsFromValue,
  settingsToValue,
  TOOL_CALL_LOG_MODES,
} from '../types/settings';
import type { StoreDeps } from './deps';

const KEY = 'default';

export interface SettingsStore {
  /** Defaults when nothing was written; never creates the object. */
  get(): Promise<Settings>;
  /** Optimistic read-modify-write; `mutate` must be pure (it can run several times). */
  update(mutate: (cur: Settings) => Settings | typeof SKIP): Promise<Settings>;
}

export class GatewaySettingsStore implements SettingsStore {
  private cache: { value: Settings; at: number } | undefined;

  constructor(
    private readonly deps: StoreDeps,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now
  ) {}

  async get(): Promise<Settings> {
    if (this.ttlMs > 0 && this.cache && this.now() - this.cache.at < this.ttlMs) {
      return this.cache.value;
    }
    const obj = await this.deps.gw.get(this.deps.c.settings(), KEY);
    const value = obj ? settingsFromValue(obj.value) : { ...DEFAULT_SETTINGS };
    if (this.ttlMs > 0) this.cache = { value, at: this.now() };
    return value;
  }

  async update(mutate: (cur: Settings) => Settings | typeof SKIP): Promise<Settings> {
    const result = await updateWithRetry<Record<string, unknown>>(
      this.deps.gw,
      this.deps.c.settings(),
      KEY,
      (cur) => {
        const current = cur ? settingsFromValue(cur) : { ...DEFAULT_SETTINGS };
        const next = mutate(current);
        if (next === SKIP) return SKIP;
        if (!TOOL_CALL_LOG_MODES.includes(next.toolCallLogs)) {
          throw new ValidationError(
            `toolCallLogs must be one of ${TOOL_CALL_LOG_MODES.join(', ')}`
          );
        }
        return settingsToValue({ ...next, updatedAt: this.now() });
      }
    );
    this.cache = undefined;
    return result.value ? settingsFromValue(result.value) : { ...DEFAULT_SETTINGS };
  }
}
