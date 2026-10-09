/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// OWNED BY SPEC F - replace body, keep the exported type.
import { str } from '../parse';
import { SectionParser } from '../types';

export interface LlmConfig {
  modelName?: string;
  liteModelName?: string;
  imageModelName?: string;
  liteThinkingLevel?: string;
}

export const parseLlm: SectionParser<LlmConfig> = (env) => ({
  errors: [],
  value: {
    modelName: str(env, 'GEMINI_MODEL_NAME'),
    liteModelName: str(env, 'GEMINI_LITE_MODEL_NAME'),
    imageModelName: str(env, 'GEMINI_IMAGE_MODEL_NAME'),
    liteThinkingLevel: str(env, 'GEMINI_LITE_THINKING_LEVEL'),
  },
});
