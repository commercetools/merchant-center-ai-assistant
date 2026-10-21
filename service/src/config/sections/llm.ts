/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { oneOf, str } from '../parse';
import { SectionParser } from '../types';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface LlmConfig {
  mainModel: string;
  liteModel: string;
  imageModel: string;
  liteThinkingLevel: ThinkingLevel;
}

const MODEL_NAME = /^[A-Za-z0-9._-]{3,100}$/;

function modelName(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string,
  errors: string[]
): string {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  if (MODEL_NAME.test(raw)) return raw;
  errors.push(`${key}: has an invalid format`);
  return fallback;
}

export const parseLlm: SectionParser<LlmConfig> = (env) => {
  const errors: string[] = [];
  return {
    errors,
    value: {
      // Each tier has its own variable (the legacy code let one variable pin two tiers).
      mainModel: modelName(env, 'GEMINI_MODEL_NAME', 'gemini-3.8-flash', errors),
      liteModel: modelName(env, 'GEMINI_LITE_MODEL_NAME', 'gemini-3.5-flash-lite', errors),
      imageModel: modelName(env, 'GEMINI_IMAGE_MODEL_NAME', 'gemini-2.5-flash-image', errors),
      liteThinkingLevel: oneOf(
        env,
        'GEMINI_LITE_THINKING_LEVEL',
        ['minimal', 'low', 'medium', 'high'] as const,
        'minimal',
        errors
      ),
    },
  };
};
