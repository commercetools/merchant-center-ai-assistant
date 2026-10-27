/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { GoogleGenAI } from '@google/genai';
import { getGoogleCredentials } from '../gcp/credentials';
import { logger } from '../utils/logger.utils';
import { ModelTier, getModelName } from './models';

let ai: GoogleGenAI | undefined;

function client(): GoogleGenAI {
  if (!ai) {
    const c = getGoogleCredentials();
    ai = new GoogleGenAI({
      vertexai: true,
      project: c.projectId,
      location: c.location,
      googleAuthOptions: c.googleAuthOptions,
    });
  }
  return ai;
}

/** Name plus a short message with anything key-shaped removed. */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : '';
  const safe = message.includes('-----BEGIN') ? '[redacted]' : message.slice(0, 200);
  return `${name}: ${safe}`;
}

/**
 * Token count through Vertex. Callers use it as a soft guard, so an unknown
 * count is `0` (legacy contract): a failure is logged, never thrown.
 */
export async function countTokens(text: string, tier: ModelTier = 'main'): Promise<number> {
  try {
    const result = await client().models.countTokens({
      model: getModelName(tier),
      contents: text,
    });
    return result.totalTokens ?? 0;
  } catch (error) {
    // Never log `text`.
    logger.error('countTokens failed', { tier, error: describeError(error) });
    return 0;
  }
}

export function resetCountTokensForTests(): void {
  ai = undefined;
}
