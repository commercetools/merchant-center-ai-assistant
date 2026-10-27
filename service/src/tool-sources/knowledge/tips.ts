/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Log } from '../../utils/log.types';
import { getMcpPrompt } from '../mcp-tools';
import {
  DEVELOPER_TIPS_PROMPT,
  KNOWLEDGE_MCP_URL,
  KNOWLEDGE_SOURCE_NAME,
  TIPS_TTL_MS,
} from './constants';

/**
 * Last fetched developer-tips text. `ToolSource.getPrompt` is synchronous, so `getTools`
 * warms this memo and `getPrompt` reads it back (the registry resolves tools before it
 * builds the instructions). Process-wide and only an optimisation: a cold or expired memo
 * simply yields no tips block.
 */
let memo: { text: string; expiresAt: number } | null = null;

export const resetTipsForTests = (): void => {
  memo = null;
};

/** Fetches (or refreshes) the tips. Never throws: a failure leaves the tips empty. */
export const warmTips = async (log: Log): Promise<void> => {
  if (memo && memo.expiresAt > Date.now()) return;
  try {
    const text = await getMcpPrompt({
      cacheKey: `${KNOWLEDGE_SOURCE_NAME}:prompt:${DEVELOPER_TIPS_PROMPT}`,
      url: KNOWLEDGE_MCP_URL,
      name: DEVELOPER_TIPS_PROMPT,
      ttlMs: TIPS_TTL_MS,
      // Fixed, service-controlled host: a canonical-host or trailing-slash redirect is safe.
      redirect: 'follow',
      label: KNOWLEDGE_SOURCE_NAME,
      log,
    });
    if (text) memo = { text, expiresAt: Date.now() + TIPS_TTL_MS };
  } catch {
    // getMcpPrompt already swallows expected failures; keep this a hard guarantee.
  }
};

/** `<commercetools_api_tips>` block while the memo is fresh, else `''`. Synchronous. */
export const tipsBlockOrEmpty = (): string =>
  memo && memo.expiresAt > Date.now()
    ? `<commercetools_api_tips>\n${memo.text}\n</commercetools_api_tips>`
    : '';
