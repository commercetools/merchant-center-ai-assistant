/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Pure helpers. Upload, resize and base64 conversion live behind `ImageUploader`; nothing
 * here does I/O.
 */

/** Reference to an original file URL (the image prompt lists them for the model). */
export interface UrlReference {
  messageId: string;
  url: string;
}

type PartWithUrl = {
  type?: string;
  url?: string;
  output?: { parts?: PartWithUrl[] };
};

/**
 * A stored file is addressable when it is a web URL (public bucket mode) or a
 * service-relative `/files/...` path (private mode). `data:` URLs are never stored and never
 * referenced.
 */
const isReferenceableFilePart = (part: PartWithUrl): boolean =>
  part.type === 'file' &&
  typeof part.url === 'string' &&
  !part.url.startsWith('data:') &&
  (part.url.startsWith('http://') ||
    part.url.startsWith('https://') ||
    part.url.startsWith('/files/'));

const hasNestedParts = (part: PartWithUrl): boolean =>
  typeof part.type === 'string' &&
  part.type.startsWith('tool-') &&
  Array.isArray(part.output?.parts);

const collect = (
  parts: PartWithUrl[],
  messageId: string,
  into: UrlReference[]
): void => {
  for (const part of parts) {
    if (isReferenceableFilePart(part) && part.url) {
      into.push({ messageId, url: part.url });
    }
    if (hasNestedParts(part) && part.output?.parts) {
      collect(part.output.parts, messageId, into);
    }
  }
};

/**
 * All file URL references of the messages, including files nested in subagent tool outputs.
 * Does not modify its input.
 */
export const extractUrlReferences = (
  messages: ReadonlyArray<{ id: string; parts?: unknown[] }>
): UrlReference[] => {
  const references: UrlReference[] = [];
  for (const message of messages) {
    collect((message.parts ?? []) as PartWithUrl[], message.id, references);
  }
  return references;
};
