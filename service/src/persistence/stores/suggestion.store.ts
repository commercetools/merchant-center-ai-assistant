/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { assertSafeId } from '../names';
import { suggestionFromValue, UserSuggestions } from '../types/suggestion';
import type { StoreDeps } from './deps';

export interface SuggestionStore {
  get(userId: string): Promise<UserSuggestions | null>;
  set(userId: string, v: UserSuggestions): Promise<void>;
}

/** A cache: read failures read as a miss, write failures are logged and swallowed. */
export class GatewaySuggestionStore implements SuggestionStore {
  constructor(private readonly deps: StoreDeps) {}

  async get(userId: string): Promise<UserSuggestions | null> {
    try {
      const obj = await this.deps.gw.get(
        this.deps.c.suggestions(),
        assertSafeId(userId)
      );
      return obj ? suggestionFromValue(obj.value) : null;
    } catch (e) {
      logger.warn(`persistence: suggestion read failed (${(e as Error).name})`);
      return null;
    }
  }

  async set(userId: string, v: UserSuggestions): Promise<void> {
    try {
      await this.deps.gw.put(this.deps.c.suggestions(), assertSafeId(userId), {
        suggestions: v.suggestions,
        generatedAt: v.generatedAt,
        locale: v.locale,
        basedOn: v.basedOn,
      });
    } catch (e) {
      logger.warn(`persistence: suggestion write failed (${(e as Error).name})`);
    }
  }
}
