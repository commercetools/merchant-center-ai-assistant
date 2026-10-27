/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { bool, int } from '../parse';
import { SectionParser } from '../types';

/** Connect times a request out after 5 minutes; keep 15 s of margin at the very least. */
export const MAX_CHAT_REQUEST_BUDGET_MS = 285_000;
export const MIN_CHAT_FINALIZE_RESERVE_MS = 5_000;

export interface ChatConfig {
  /** Time one chat turn may take, from the request start to the end of the stream. */
  requestBudgetMs: number;
  /** Part of the budget kept for the wrap-up step (soft deadline = budget - reserve). */
  finalizeReserveMs: number;
  /**
   * Fallback for a runtime that freezes CPU once the response has closed: the
   * turn digest then runs BEFORE the stream closes, for at most `DIGEST_BEFORE_CLOSE_CAP_MS`.
   * Off by default: the digest runs detached after the answer (the answer is never delayed).
   */
  digestBeforeClose: boolean;
}

/** Upper bound the stream close waits for the digest when `digestBeforeClose` is on. */
export const DIGEST_BEFORE_CLOSE_CAP_MS = 3_000;

/**
 * The chat stream's time budget.
 * Connect times a service request out after 5 minutes
 * (https://docs.commercetools.com/connect/deployment-behavior-and-environments.md), so a
 * longer budget would be cut by the platform with a truncated stream.
 */
export const parseChat: SectionParser<ChatConfig> = (env) => {
  const errors: string[] = [];
  const requestBudgetMs = int(
    env,
    'CHAT_REQUEST_BUDGET_MS',
    270_000,
    { min: 1 },
    errors
  );
  const finalizeReserveMs = int(
    env,
    'CHAT_FINALIZE_RESERVE_MS',
    30_000,
    { min: 1 },
    errors
  );

  if (requestBudgetMs > MAX_CHAT_REQUEST_BUDGET_MS) {
    errors.push(
      `CHAT_REQUEST_BUDGET_MS: must be an integer <= ${MAX_CHAT_REQUEST_BUDGET_MS} (Connect times requests out after 5 minutes)`
    );
  }
  if (
    finalizeReserveMs < MIN_CHAT_FINALIZE_RESERVE_MS ||
    finalizeReserveMs > requestBudgetMs / 2
  ) {
    errors.push(
      `CHAT_FINALIZE_RESERVE_MS: must be an integer between ${MIN_CHAT_FINALIZE_RESERVE_MS} and CHAT_REQUEST_BUDGET_MS / 2`
    );
  }

  const digestBeforeClose = bool(
    env,
    'CHAT_DIGEST_BEFORE_CLOSE',
    false,
    errors
  );

  return {
    value: { requestBudgetMs, finalizeReserveMs, digestBeforeClose },
    errors,
  };
};
