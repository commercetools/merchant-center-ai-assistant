/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { processMessagesForStorage } from '../../src/chat/storage-filter';

type In = Parameters<typeof processMessagesForStorage>[0][number];

const message = (parts: unknown[], extra: Partial<In> = {}): In =>
  ({ id: 'm1', role: 'assistant', parts, ...extra }) as In;

const store = (parts: unknown[], extra: Partial<In> = {}) =>
  processMessagesForStorage([message(parts, extra)]);

describe('processMessagesForStorage', () => {
  it('keeps non-empty text and drops empty text', () => {
    expect(store([{ type: 'text', text: 'hello' }])[0].parts).toEqual([
      { type: 'text', text: 'hello' },
    ]);
    expect(store([{ type: 'text', text: '' }])).toEqual([]);
  });

  it('drops a base64 file and keeps a web file', () => {
    const out = store([
      { type: 'text', text: 'x' },
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' },
      { type: 'file', mediaType: 'image/png', url: 'https://example.test/a.png' },
    ]);
    expect(out[0].parts).toEqual([
      { type: 'text', text: 'x' },
      { type: 'file', url: 'https://example.test/a.png', mediaType: 'image/png' },
    ]);
  });

  it('keeps a service-relative /files/ image path', () => {
    const out = store([{ type: 'file', mediaType: 'image/png', url: '/files/s1/a.png' }]);
    expect(out[0].parts[0]).toMatchObject({ url: '/files/s1/a.png' });
  });

  it('keeps the annotation part unchanged', () => {
    const data = { pageTitle: 'P', annotations: [{ comment: 'c' }], components: [] };
    const out = store([{ type: 'data-ct-annotations', data }]);
    expect(out[0].parts).toEqual([{ type: 'data-ct-annotations', data }]);
  });

  it('keeps a terminal visualize_data part and drops one without output', () => {
    const kept = store([
      {
        type: 'tool-visualize_data',
        toolCallId: 'c1',
        state: 'output-available',
        input: { huge: true },
        output: { success: true },
      },
    ]);
    expect(kept[0].parts[0]).toEqual({
      type: 'tool-visualize_data',
      toolCallId: 'c1',
      toolName: 'visualize_data',
      state: 'output-available',
      output: { success: true },
    });
    expect(
      store([{ type: 'tool-visualize_data', toolCallId: 'c2', state: 'input-available' }])
    ).toEqual([]);
  });

  it('keeps export_data and create_composed_page outputs', () => {
    const out = store([
      { type: 'tool-export_data', state: 'output-available', output: { success: true } },
      { type: 'tool-create_composed_page', state: 'output-available', output: { key: 'k' } },
    ]);
    expect(out[0].parts.map((p) => p.toolName)).toEqual(['export_data', 'create_composed_page']);
  });

  it('drops tool parts of other tools', () => {
    expect(
      store([{ type: 'tool-echo', state: 'output-available', output: 'x' }])
    ).toEqual([]);
  });

  it('reduces the nested parts of a subagent output', () => {
    const out = store([
      {
        type: 'tool-imageGeneration',
        toolCallId: 'i1',
        state: 'output-available',
        output: {
          role: 'assistant',
          parts: [
            { type: 'text', text: 'done' },
            { type: 'text', text: '' },
            { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' },
            { type: 'file', mediaType: 'image/png', url: '/files/s1/g.png' },
            { type: 'step-start' },
            {
              type: 'tool-visualize_data',
              state: 'output-available',
              output: { success: true },
            },
          ],
        },
      },
    ]);
    const output = out[0].parts[0].output as { role: string; parts: Array<Record<string, unknown>> };
    expect(output.parts.map((p) => p.type)).toEqual(['text', 'file', 'tool-visualize_data']);
    expect(output.parts[1].url).toBe('/files/s1/g.png');
  });

  it('drops a subagent part that is not finished', () => {
    expect(
      store([{ type: 'tool-imageGeneration', state: 'input-streaming' }])
    ).toEqual([]);
  });

  it('drops a message left with no parts', () => {
    const out = processMessagesForStorage([
      message([{ type: 'reasoning', text: 'thinking' }], { id: 'a' }),
      message([{ type: 'text', text: 'kept' }], { id: 'b' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['b']);
  });

  it('never stores transient or keep-alive parts but keeps the time-limit marker', () => {
    const out = store([
      { type: 'data-keepalive', data: {}, transient: true },
      { type: 'data-other', data: { x: 1 } },
      { type: 'data-turn-status', data: { status: 'time-limit' } },
    ]);
    expect(out[0].parts).toEqual([
      { type: 'data-turn-status', data: { status: 'time-limit' } },
    ]);
  });

  it('keeps only the usage counters of the metadata', () => {
    const out = store([{ type: 'text', text: 'x' }], {
      metadata: { usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7, cachedInputTokens: 9 } },
    });
    expect(out[0].metadata).toEqual({
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    });
  });

  it('omits metadata when there is no usage', () => {
    expect(store([{ type: 'text', text: 'x' }])[0].metadata).toBeUndefined();
  });

  it('keeps the role and id of each message', () => {
    const out = processMessagesForStorage([
      message([{ type: 'text', text: 'q' }], { id: 'u1', role: 'user' }),
    ]);
    expect(out[0]).toMatchObject({ id: 'u1', role: 'user' });
  });
});
