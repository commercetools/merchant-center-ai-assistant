/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ToolLoopAgent, type ModelMessage, type UIMessage } from 'ai';
import { AGENT_META } from '../agents/agent-keys';
import { getImageGenerationPrompt } from '../agents/prompts';
import {
  createSubagentTool,
  type AgentDefinition,
} from '../agents/subagent-tool';
import { countTokens, getModel } from '../llm';
import { logger } from '../utils/logger.utils';
import { getImageUploader } from './image-uploader';
import type { ToolContext, ToolSource } from './types';

export const IMAGE_GENERATION_TOOL = 'imageGeneration';

/** Above this many tokens the inherited history is dropped (legacy guard). */
export const IMAGE_HISTORY_TOKEN_LIMIT = 1_000_000;

/** `data:image/png;base64,AAAA` -> bytes + media type; null when it is not a base64 data URL. */
export const dataUrlToUint8Array = (
  url: string
): { bytes: Uint8Array; mediaType: string } | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match || !match[2]) return null;
  return {
    mediaType: match[1] ?? 'application/octet-stream',
    bytes: new Uint8Array(Buffer.from(match[3], 'base64')),
  };
};

type FilePartLike = {
  type?: string;
  state?: string;
  url?: string;
  mediaType?: string;
};

/**
 * Replaces the generated `data:` image of the last part by what the uploader stores (a public
 * URL, or a service-relative `/files/...` path in private mode). A failed upload leaves the
 * message unchanged; the storage filter then drops the base64 part instead of persisting it.
 */
export const uploadGeneratedImage = async (
  message: UIMessage,
  ctx: ToolContext
): Promise<UIMessage> => {
  const parts = message?.parts;
  if (!parts || parts.length === 0) return message;

  const last = parts[parts.length - 1] as FilePartLike;
  if (last?.type !== 'file') return message;
  if (last.state !== 'done' && last.state !== undefined) return message;
  if (!last.url?.startsWith('data:') || !last.mediaType?.startsWith('image/'))
    return message;

  const uploader = getImageUploader();
  const decoded = dataUrlToUint8Array(last.url);
  if (!uploader || !decoded) return message;

  try {
    const url = await uploader.upload(
      decoded.bytes,
      last.mediaType,
      ctx.sessionId
    );
    if (!url) return message;
    const next = [...parts];
    next[next.length - 1] = { ...last, url } as UIMessage['parts'][number];
    return { ...message, parts: next };
  } catch (error) {
    logger.error('generated image upload failed', {
      sessionId: ctx.sessionId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return message;
  }
};

/**
 * The image generation subagent: the model itself produces the image (multi-modal output), so
 * the child has no tools. `getModel('image')` is a language model; no provider options are
 * passed on purpose (image-model options such as aspectRatio are not language-model options
 * and were silently stripped by the provider in the legacy code).
 */
export const imageGenerationAgent: AgentDefinition = {
  meta: { key: 'imageGeneration', ...AGENT_META.imageGeneration },
  createAgent: async (ctx) =>
    new ToolLoopAgent({
      model: getModel('image'),
      instructions: getImageGenerationPrompt(ctx),
      toolChoice: 'none',
      temperature: 0.3,
    }),
  prepareTaskMessages: async (messages: ModelMessage[]) => {
    // The history reaching here was already made model-safe by the history loader (stored
    // `/files/...` images converted by the uploader's `toModelMessages`).
    const tokens = await countTokens(JSON.stringify(messages));
    return tokens > IMAGE_HISTORY_TOKEN_LIMIT ? [] : messages;
  },
  processMessage: uploadGeneratedImage,
};

/**
 * Enabled only while an `ImageUploader` (change L) is registered: without one the tool is
 * absent from the tool set and from the instructions.
 */
export const imageGenerationSource: ToolSource = {
  name: IMAGE_GENERATION_TOOL,
  displayName: 'Image generation',
  description:
    'Generates and edits images from a description. Give it a clear, complete task.',
  kind: 'core',
  routingHints:
    'Keywords: generate image, create image, make image, picture, photo, edit image, modify image, image generation, draw, illustration.',
  order: 130,
  isEnabled: async () => getImageUploader() !== undefined,
  getTools: async (ctx) => ({
    [IMAGE_GENERATION_TOOL]: createSubagentTool(imageGenerationAgent, ctx),
  }),
  listForMenu: async () => null,
  getPrompt: () => '',
};
