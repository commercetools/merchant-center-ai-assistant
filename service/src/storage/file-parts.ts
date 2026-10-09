/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { UIMessage } from 'ai';
import { logger } from '../utils/logger.utils';
import {
  FILES_PATH_PREFIX,
  FILE_NAME_PATTERN,
  IMAGE_OBJECT_PREFIX,
  MODEL_IMAGE_WIDTH,
  TYPE_BY_EXTENSION,
} from './constants';
import { bucket, storageTarget } from './ports';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null;

export interface StoredImageRef {
  sessionId: string;
  fileName: string;
}

const SESSION_ID = /^[0-9a-fA-F-]{36}$/;

/**
 * The stored image a part URL names: `/files/{sessionId}/{fileName}` or, in `public` mode,
 * `https://storage.googleapis.com/{bucket}/images/{sessionId}/{fileName}` of OUR bucket.
 * `undefined` for anything else.
 */
export function parseStoredImageUrl(
  url: string,
  target: { bucketName: string; mode: 'private' | 'public' }
): StoredImageRef | undefined {
  let rest: string | undefined;
  if (url.startsWith(`${FILES_PATH_PREFIX}/`)) {
    rest = url.slice(FILES_PATH_PREFIX.length + 1);
  } else if (target.mode === 'public') {
    const prefix = `https://storage.googleapis.com/${target.bucketName}/${IMAGE_OBJECT_PREFIX}`;
    if (url.startsWith(prefix)) rest = url.slice(prefix.length);
  }
  if (rest === undefined) return undefined;
  const parts = rest.split('/');
  if (parts.length !== 2) return undefined;
  const [sessionId, fileName] = parts;
  if (!SESSION_ID.test(sessionId) || !FILE_NAME_PATTERN.test(fileName)) return undefined;
  return { sessionId, fileName };
}

let sharpWarned = false;

/** Downscales to `MODEL_IMAGE_WIDTH`; without `sharp` (native build failed) the bytes pass unchanged. */
async function downscale(bytes: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(bytes)
      .resize({ width: MODEL_IMAGE_WIDTH, withoutEnlargement: true })
      .toBuffer();
  } catch {
    if (!sharpWarned) {
      sharpWarned = true;
      logger.warn('sharp is not available: images are sent to the model without downscaling');
    }
    return bytes;
  }
}

async function loadAsDataUrl(ref: StoredImageRef): Promise<string> {
  const [bytes] = await bucket()
    .file(`${IMAGE_OBJECT_PREFIX}${ref.sessionId}/${ref.fileName}`)
    .download();
  const extension = ref.fileName.slice(ref.fileName.lastIndexOf('.') + 1);
  const mediaType = TYPE_BY_EXTENSION[extension] ?? 'image/png';
  const small = await downscale(bytes);
  return `data:${mediaType};base64,${small.toString('base64')}`;
}

/** Returns a converted copy of `part`, or `null` when it must be dropped. */
async function convertPart(
  part: unknown,
  sessionId: string | undefined,
  target: ReturnType<typeof storageTarget>
): Promise<unknown | null> {
  if (!isRecord(part)) return part;

  if (part.type === 'file' && typeof part.url === 'string') {
    const url = part.url;
    if (url.startsWith('data:')) return part;
    const ref = parseStoredImageUrl(url, target);
    if (!ref || ref.sessionId !== sessionId) {
      // Relative or foreign URL, or another session's image: never fetched, never sent.
      logger.warn('Dropped a file part that is not an image of this session');
      return null;
    }
    try {
      return { ...part, url: await loadAsDataUrl(ref) };
    } catch (error) {
      logger.error('Could not read a stored image for the model', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  // Files nested in sub-agent tool outputs (`output.parts`).
  const output = part.output;
  if (isRecord(output) && Array.isArray(output.parts)) {
    const parts = await convertParts(output.parts, sessionId, target);
    return { ...part, output: { ...output, parts } };
  }
  return part;
}

async function convertParts(
  parts: unknown[],
  sessionId: string | undefined,
  target: ReturnType<typeof storageTarget>
): Promise<unknown[]> {
  const converted = await Promise.all(parts.map((p) => convertPart(p, sessionId, target)));
  return converted.filter((p) => p !== null);
}

/**
 * Port of the legacy `convertFilePartMessages` for the private bucket: every file part that
 * names a stored image of THIS session is read through the Storage API (never an HTTP fetch),
 * downscaled and replaced by base64 data. Everything else that is not a `data:` URL is
 * dropped with a log (a relative URL must never reach the model provider, and a part naming
 * another session's image is a forged reference). Works on a copy: stored messages are never
 * mutated.
 */
export async function convertMessagesForModel(
  messages: UIMessage[],
  options: { sessionId?: string } = {}
): Promise<UIMessage[]> {
  const target = storageTarget();
  return Promise.all(
    messages.map(async (message) => {
      if (!Array.isArray(message.parts)) return message;
      const parts = await convertParts(message.parts, options.sessionId, target);
      return { ...message, parts } as UIMessage;
    })
  );
}
