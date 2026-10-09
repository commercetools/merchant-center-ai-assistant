/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';
import type { MessageService } from '../services/message.service';
import {
  IMAGE_GENERATION_TOOL,
  imageGenerationHistoryTools,
} from '../tool-sources/image-generation.source';
import { getImageUploader } from '../tool-sources/image-uploader';
import type { AiSdkChatMessage } from '../types/chat.types';
import { logger } from '../utils/logger.utils';
import { stripSystemMessages } from '../utils/message.utils';
import { convertAnnotationDataPart } from './annotation-part';
import { CHAT_HISTORY_MESSAGES, HISTORY_IMAGES_FOR_MODEL } from './constants';

export type IncomingMessage = Pick<AiSdkChatMessage, 'id' | 'role' | 'parts'> &
  Partial<Pick<AiSdkChatMessage, 'metadata'>>;

export interface LoadedHistory {
  /** What the model receives: the newest 20 stored messages plus the new one. */
  modelMessages: ModelMessage[];
  /** The same messages in UI shape, system-role ones removed (for URL references). */
  storageMessages: AiSdkChatMessage[];
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null;

const isImageToolPart = (part: unknown): part is Json & { output: Json } =>
  isRecord(part) &&
  part.type === `tool-${IMAGE_GENERATION_TOOL}` &&
  isRecord(part.output) &&
  Array.isArray(part.output.parts);

/**
 * Keeps the files nested in the outputs of the newest `keep` image generations and strips them
 * from older ones. Every kept image is downloaded and sent to the model on EVERY later turn,
 * so the count is bounded. Works on copies.
 */
export const keepNewestGeneratedImages = (
  messages: UIMessage[],
  keep: number
): UIMessage[] => {
  let remaining = keep;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const parts = out[i].parts;
    if (!Array.isArray(parts)) continue;
    let changed = false;
    const next = [...parts];
    for (let j = next.length - 1; j >= 0; j -= 1) {
      const part: unknown = next[j];
      if (!isImageToolPart(part)) continue;
      const nested = part.output.parts as unknown[];
      if (!nested.some((p) => isRecord(p) && p.type === 'file')) continue;
      if (remaining > 0) {
        remaining -= 1;
        continue;
      }
      next[j] = {
        ...part,
        output: {
          ...part.output,
          parts: nested.filter((p) => !(isRecord(p) && p.type === 'file')),
        },
      } as UIMessage['parts'][number];
      changed = true;
    }
    if (changed) out[i] = { ...out[i], parts: next };
  }
  return out;
};

/**
 * The model input of one turn (capability chat-stream-endpoint, "History window").
 *
 * 1. the newest `CHAT_HISTORY_MESSAGES` (20) stored messages, oldest first;
 * 2. plus the incoming message unless its id is already the last stored id. The stream route
 *    stores the user message fire-and-forget, so it may not be committed yet (race guard);
 * 3. `system`-role messages removed (ai v7 rejects them in `messages`);
 * 4. stored service-relative `/files/...` images converted to base64 by the image uploader
 *    (when one is registered), so a relative URL never reaches the provider;
 * 5. `convertToModelMessages` (with the image tool's `toModelOutput`, so the newest generated
 *    images reach the model as images and can be edited) with the annotation data-part converter, because data parts are
 *    invisible to the model otherwise.
 */
export const loadHistory = async (params: {
  messages: MessageService;
  sessionId: string;
  incoming: IncomingMessage;
}): Promise<LoadedHistory> => {
  const { messages, sessionId, incoming } = params;

  const stored = await messages.lastN(sessionId, CHAT_HISTORY_MESSAGES);
  const storageMessages: AiSdkChatMessage[] = [...stored];
  if (
    storageMessages.length === 0 ||
    storageMessages[storageMessages.length - 1].id !== incoming.id
  ) {
    storageMessages.push({
      id: incoming.id,
      role: incoming.role,
      parts: incoming.parts,
      metadata: incoming.metadata,
      timestamp: Date.now(),
    });
  }

  const withoutSystem = stripSystemMessages(storageMessages, (dropped) =>
    logger.warn(
      `Dropped ${dropped} system-role message(s) from session ${sessionId} history; ai v7 rejects them in \`messages\``
    )
  );

  const uploader = getImageUploader();
  const asUi = keepNewestGeneratedImages(
    withoutSystem as unknown as UIMessage[],
    HISTORY_IMAGES_FOR_MODEL
  );
  const uiMessages = uploader?.toModelMessages
    ? await uploader.toModelMessages(asUi, { sessionId })
    : asUi;

  const modelMessages = await convertToModelMessages(uiMessages, {
    tools: imageGenerationHistoryTools,
    // Data parts are UI-only unless converted. Without this the annotations the preview
    // toolbar attaches would render in the transcript and never reach the model.
    convertDataPart: (part) =>
      convertAnnotationDataPart(part as { type: string; data?: unknown }),
  });

  return { modelMessages, storageMessages: withoutSystem };
};
