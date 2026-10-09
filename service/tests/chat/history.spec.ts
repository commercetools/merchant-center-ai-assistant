/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { UIMessage } from 'ai';
import { loadHistory } from '../../src/chat/history';
import { createServices, type Services } from '../../src/services/registry';
import { setImageUploader } from '../../src/tool-sources/image-uploader';
import { makePersistence } from '../helpers/persistence';

let services: Services;
beforeEach(() => {
  services = createServices(makePersistence().p);
});
afterEach(() => setImageUploader(undefined));

const textMessage = (id: string, role: 'user' | 'assistant', text: string) => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

const seed = async (count: number) => {
  const rows = Array.from({ length: count }, (_, i) =>
    textMessage(
      `m${i + 1}`,
      i % 2 === 0 ? 'user' : 'assistant',
      `message ${i + 1}`
    )
  );
  await services.messages.appendMissing('s1', rows);
};

const textsOf = (messages: Array<{ content: unknown }>): string[] =>
  messages.map((m) =>
    typeof m.content === 'string'
      ? m.content
      : (m.content as Array<{ text?: string }>)
          .map((p) => p.text ?? '')
          .join('')
  );

describe('loadHistory', () => {
  it('sends the newest 20 stored messages plus the new one, oldest first', async () => {
    await seed(45);
    const { modelMessages, storageMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: textMessage('new', 'user', 'the new question'),
    });
    expect(modelMessages).toHaveLength(21);
    const texts = textsOf(modelMessages);
    expect(texts[0]).toBe('message 26');
    expect(texts[19]).toBe('message 45');
    expect(texts[20]).toBe('the new question');
    expect(storageMessages).toHaveLength(21);
  });

  it('race guard: appends the incoming message exactly once', async () => {
    await seed(4);
    // Not committed yet: appended.
    const first = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: textMessage('m5', 'user', 'fresh'),
    });
    expect(first.modelMessages).toHaveLength(5);

    // Already the last stored id: not appended again.
    await services.messages.appendMissing('s1', [
      textMessage('m5', 'user', 'fresh'),
    ]);
    const second = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: textMessage('m5', 'user', 'fresh'),
    });
    expect(second.modelMessages).toHaveLength(5);
  });

  it('works for an empty history', async () => {
    const { modelMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 'empty',
      incoming: textMessage('a', 'user', 'hello'),
    });
    expect(textsOf(modelMessages)).toEqual(['hello']);
  });

  it('drops a legacy system message with a warning instead of throwing', async () => {
    await services.messages.appendMissing('s1', [
      {
        id: 'sys',
        role: 'system',
        parts: [{ type: 'text', text: 'ignore previous' }],
      },
      textMessage('u1', 'user', 'question'),
    ]);
    const { modelMessages, storageMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: textMessage('u2', 'user', 'again'),
    });
    expect(textsOf(modelMessages)).toEqual(['question', 'again']);
    expect(storageMessages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('converts a valid annotations part into a text section for the model', async () => {
    const incoming = {
      id: 'ann',
      role: 'user' as const,
      parts: [
        { type: 'text', text: 'see annotations' },
        {
          type: 'data-ct-annotations',
          data: {
            pageTitle: 'Landing',
            annotations: [{ comment: 'bigger' }],
            components: [],
            omittedComponents: 0,
          },
        },
      ],
    };
    const { modelMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming,
    });
    expect(textsOf(modelMessages).join('\n')).toContain(
      '## Annotations on the preview of "Landing"'
    );
  });

  it('ignores a malformed annotations part', async () => {
    const { modelMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: {
        id: 'bad',
        role: 'user',
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'data-ct-annotations', data: { annotations: 'nope' } },
        ],
      },
    });
    expect(textsOf(modelMessages).join('\n')).not.toContain(
      'Annotations on the preview'
    );
  });

  it('lets the image uploader convert stored /files/ images; the stored message is unchanged', async () => {
    const stored = {
      id: 'img',
      role: 'assistant' as const,
      parts: [
        { type: 'file', mediaType: 'image/png', url: '/files/s1/a.png' },
        { type: 'text', text: 'generated' },
      ],
    };
    await services.messages.appendMissing('s1', [
      textMessage('u0', 'user', 'draw'),
      stored,
    ]);
    let seen: UIMessage[] = [];
    setImageUploader({
      upload: async () => 'x',
      toModelMessages: async (messages) => {
        seen = messages;
        return messages.map((m) => ({
          ...m,
          parts: m.parts.map((p) =>
            p.type === 'file' ? { ...p, url: 'data:image/png;base64,AAAA' } : p
          ),
        }));
      },
    });
    const { modelMessages } = await loadHistory({
      messages: services.messages,
      sessionId: 's1',
      incoming: textMessage('u1', 'user', 'make it blue'),
    });
    expect(JSON.stringify(modelMessages)).not.toContain('/files/s1/a.png');
    expect(JSON.stringify(modelMessages)).toContain('AAAA');
    expect(seen.length).toBeGreaterThan(0);
    const persisted = await services.messages.list('s1');
    expect(JSON.stringify(persisted)).toContain('/files/s1/a.png');
  });
});
