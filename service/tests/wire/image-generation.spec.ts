/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import type { UIMessage } from 'ai';
import {
  dataUrlToUint8Array,
  imageGenerationSource,
  uploadGeneratedImage,
} from '../../src/tool-sources/image-generation.source';
import {
  getImageUploader,
  setImageUploader,
} from '../../src/tool-sources/image-uploader';
import { registry } from '../../src/tool-sources';
import type { ImageUploader } from '../../src/tool-sources/types';
import { makeToolContext } from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  setImageUploader(undefined);
  while (contexts.length) contexts.pop()?.dispose();
});

const ctxOf = () => {
  const ctx = makeToolContext();
  contexts.push(ctx);
  return ctx;
};

const PNG = 'data:image/png;base64,AAECAw==';

const imageMessage = (state: string | undefined = 'done'): UIMessage => ({
  id: 'm1',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'here' },
    { type: 'file', mediaType: 'image/png', url: PNG, state } as never,
  ],
});

describe('ImageUploader hook', () => {
  it('sets and clears the uploader', () => {
    const uploader: ImageUploader = { upload: async () => 'u' };
    setImageUploader(uploader);
    expect(getImageUploader()).toBe(uploader);
    setImageUploader(undefined);
    expect(getImageUploader()).toBeUndefined();
  });
});

describe('imageGeneration source gating', () => {
  it('is disabled and absent without an uploader', async () => {
    const ctx = ctxOf();
    expect(await imageGenerationSource.isEnabled(ctx)).toBe(false);
    const { tools, fragments } = await registry.resolve(ctx);
    expect(tools.imageGeneration).toBeUndefined();
    expect(fragments.join('').toLowerCase()).not.toContain('image generation');
  });

  it('is enabled with an uploader and contributes the subagent tool', async () => {
    setImageUploader({ upload: async () => 'u' });
    const ctx = ctxOf();
    expect(await imageGenerationSource.isEnabled(ctx)).toBe(true);
    const { tools } = await registry.resolve(ctx);
    expect(Object.keys(tools)).toContain('imageGeneration');
  });

  it('honours the session switch', async () => {
    setImageUploader({ upload: async () => 'u' });
    const ctx = makeToolContext({
      session: { disabledTools: { imageGeneration: ['all_tools'] } },
    });
    contexts.push(ctx);
    const { tools } = await registry.resolve(ctx);
    expect(tools.imageGeneration).toBeUndefined();
  });
});

describe('uploadGeneratedImage', () => {
  it('replaces a generated data URL by what the uploader returns', async () => {
    const calls: Array<{ size: number; mediaType: string; sessionId: string }> =
      [];
    setImageUploader({
      upload: async (bytes, mediaType, sessionId) => {
        calls.push({ size: bytes.length, mediaType, sessionId });
        return '/files/s1/generated.png';
      },
    });
    const out = await uploadGeneratedImage(imageMessage(), ctxOf());
    const last = out.parts[out.parts.length - 1] as { url: string };
    expect(last.url).toBe('/files/s1/generated.png');
    expect(calls).toEqual([
      { size: 4, mediaType: 'image/png', sessionId: 's1' },
    ]);
  });

  it('leaves the message alone while the part is still streaming', async () => {
    setImageUploader({ upload: async () => 'x' });
    const message = imageMessage('streaming');
    expect(await uploadGeneratedImage(message, ctxOf())).toBe(message);
  });

  it('keeps the message when the upload fails', async () => {
    setImageUploader({
      upload: async () => {
        throw new Error('bucket down');
      },
    });
    const message = imageMessage();
    expect(await uploadGeneratedImage(message, ctxOf())).toBe(message);
  });

  it('keeps the message without an uploader', async () => {
    const message = imageMessage();
    expect(await uploadGeneratedImage(message, ctxOf())).toBe(message);
  });
});

describe('dataUrlToUint8Array', () => {
  it('decodes a base64 data URL', () => {
    const out = dataUrlToUint8Array(PNG);
    expect(out?.mediaType).toBe('image/png');
    expect([...(out?.bytes ?? [])]).toEqual([0, 1, 2, 3]);
  });

  it('rejects anything else', () => {
    expect(dataUrlToUint8Array('https://example.test/a.png')).toBeNull();
    expect(dataUrlToUint8Array('data:text/plain,hello')).toBeNull();
  });
});
