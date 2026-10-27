/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { UIMessage } from 'ai';
import { resetConfigurationForTests } from '../../src/config';
import { parseStoredImageUrl } from '../../src/storage/file-parts';
import { setStorageForTests } from '../../src/storage/ports';
import { createGcsImageUploader } from '../../src/storage/uploader';
import { FAKE_BUCKET, useGcpEnv } from '../helpers/gcp-env';
import { FakeStorage } from '../helpers/storage-fake';

const SESSION = '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab';
const OTHER = '9a9a9a9a-aaaa-4bbb-8ccc-1234567890ab';
const FILE = '1700000000000-ab12cd34.png';
let st: FakeStorage;

const msg = (parts: unknown[], role: 'user' | 'assistant' = 'assistant'): UIMessage =>
  ({ id: 'm1', role, parts }) as unknown as UIMessage;

const setup = (env: NodeJS.ProcessEnv = {}) => {
  useGcpEnv(env);
  st = new FakeStorage();
  st.objects.set(`images/${SESSION}/${FILE}`, { data: Buffer.from('PNGBYTES'), options: {} });
  setStorageForTests(st);
};

beforeEach(() => {
  setup();
  // The fake bytes are not a real image: sharp fails and the bytes pass through unchanged.
});
afterEach(() => {
  setStorageForTests(undefined);
  resetConfigurationForTests();
});

const convert = (messages: UIMessage[], sessionId: string | null = SESSION) =>
  createGcsImageUploader().toModelMessages!(messages, sessionId ? { sessionId } : undefined);

describe('toModelMessages', () => {
  it('reads through the Storage API (never fetch) and replaces the url by a data URL', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const [out] = await convert([
      msg([{ type: 'text', text: 'hi' }, { type: 'file', mediaType: 'image/png', url: `/files/${SESSION}/${FILE}` }]),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(st.downloads).toEqual([`images/${SESSION}/${FILE}`]);
    const file = out.parts[1] as { url: string };
    expect(file.url).toMatch(/^data:image\/png;base64,/);
    expect(Buffer.from(file.url.split(',')[1], 'base64').toString()).toBe('PNGBYTES');
    expect(out.parts[0]).toEqual({ type: 'text', text: 'hi' });
  });

  it('converts files nested in sub-agent tool outputs', async () => {
    const [out] = await convert([
      msg([{ type: 'tool-imageGeneration', output: { parts: [{ type: 'file', mediaType: 'image/png', url: `/files/${SESSION}/${FILE}` }] } }]),
    ]);
    const nested = (out.parts[0] as unknown as { output: { parts: { url: string }[] } }).output.parts[0];
    expect(nested.url).toMatch(/^data:image\/png;base64,/);
  });

  it("drops another session's image and a relative url of an unknown shape, without reading storage", async () => {
    const [out] = await convert([
      msg([
        { type: 'file', mediaType: 'image/png', url: `/files/${OTHER}/${FILE}` },
        { type: 'file', mediaType: 'image/png', url: '/etc/passwd' },
        { type: 'text', text: 'kept' },
      ]),
    ]);
    expect(out.parts).toEqual([{ type: 'text', text: 'kept' }]);
    expect(st.downloads).toEqual([]);
  });

  it('drops a foreign host (no anonymous fetch) and keeps data URLs', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const [out] = await convert([
      msg([
        { type: 'file', mediaType: 'image/png', url: 'https://example.test/x.png' },
        { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' },
      ]),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(out.parts).toEqual([{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' }]);
  });

  it('without the request session every stored reference is dropped (fail closed)', async () => {
    const [out] = await convert([msg([{ type: 'file', mediaType: 'image/png', url: `/files/${SESSION}/${FILE}` }])], null);
    expect(out.parts).toEqual([]);
  });

  it('a stored image that cannot be read is dropped, not thrown', async () => {
    const [out] = await convert([
      msg([{ type: 'file', mediaType: 'image/png', url: `/files/${SESSION}/1700000000001-ffffffff.png` }]),
    ]);
    expect(out.parts).toEqual([]);
  });

  it('does not mutate the stored messages', async () => {
    const original = msg([{ type: 'file', mediaType: 'image/png', url: `/files/${SESSION}/${FILE}` }]);
    const snapshot = JSON.stringify(original);
    await convert([original]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('public mode also converts a URL of our own bucket, and only ours', async () => {
    setup({ IMAGE_URL_MODE: 'public' });
    const [out] = await convert([
      msg([
        { type: 'file', mediaType: 'image/png', url: `https://storage.googleapis.com/${FAKE_BUCKET}/images/${SESSION}/${FILE}` },
        { type: 'file', mediaType: 'image/png', url: `https://storage.googleapis.com/other-bucket/images/${SESSION}/${FILE}` },
      ]),
    ]);
    expect(out.parts).toHaveLength(1);
    expect((out.parts[0] as { url: string }).url).toMatch(/^data:/);
  });
});

describe('parseStoredImageUrl', () => {
  const target = { bucketName: FAKE_BUCKET, mode: 'private' as const };
  it('accepts only the exact relative shape', () => {
    expect(parseStoredImageUrl(`/files/${SESSION}/${FILE}`, target)).toEqual({ sessionId: SESSION, fileName: FILE });
    expect(parseStoredImageUrl(`/files/${SESSION}/../x.png`, target)).toBeUndefined();
    expect(parseStoredImageUrl(`/files/${SESSION}/a.svg`, target)).toBeUndefined();
    expect(parseStoredImageUrl(`/files/not-a-uuid/${FILE}`, target)).toBeUndefined();
    expect(parseStoredImageUrl(`https://storage.googleapis.com/${FAKE_BUCKET}/images/${SESSION}/${FILE}`, target)).toBeUndefined();
  });
});
