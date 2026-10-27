/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, jest, test } from '@jest/globals';
import {
  runTurnDigest,
  runTurnDigestBeforeClose,
} from '../../src/agents/turn-digest';
import { captureLogs } from '../helpers/log-capture';

const turn = [
  { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
  {
    role: 'assistant',
    parts: [{ type: 'text', text: 'Three are below target.' }],
  },
];
const digest = {
  title: 'T',
  description: 'd',
  icon: 'sell',
  summary: 's',
  nextPrompts: [],
};

const tick = () => new Promise((r) => setImmediate(r));

describe('runTurnDigest is detached from the stream', () => {
  test('returns synchronously, before a slow digest resolves, and applies it afterwards', async () => {
    let release: (d: typeof digest) => void = () => undefined;
    const pending = new Promise<typeof digest>((resolve) => {
      release = resolve;
    });
    const applied: string[] = [];
    const started = Date.now();
    const result = runTurnDigest(
      { sessionId: 's1', userId: 'u1', messages: turn },
      {
        generate: () => pending,
        apply: async (sessionId) => {
          applied.push(sessionId);
        },
      }
    );
    expect(result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(50);
    expect(applied).toEqual([]);

    release(digest);
    await tick();
    await tick();
    expect(applied).toEqual(['s1']);
  });

  test('skips the model entirely when the turn produced no answer', async () => {
    const generate = jest.fn(async () => digest);
    runTurnDigest(
      { sessionId: 's1', userId: 'u1', messages: [turn[0]] },
      { generate, apply: async () => undefined }
    );
    await tick();
    expect(generate).not.toHaveBeenCalled();
  });

  test('a rejecting apply is caught and logged, never unhandled', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const capture = captureLogs();
    try {
      runTurnDigest(
        { sessionId: 's1', userId: 'u1', messages: turn },
        {
          generate: async () => digest,
          apply: async () => {
            throw new Error('store down');
          },
        }
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
      expect(capture.lines.some((l) => l.includes('Turn digest failed'))).toBe(
        true
      );
    } finally {
      capture.stop();
      process.off('unhandledRejection', unhandled);
    }
  });

  test('a null digest changes nothing', async () => {
    const apply = jest.fn(async () => undefined);
    runTurnDigest(
      { sessionId: 's1', userId: 'u1', messages: turn },
      { generate: async () => null, apply }
    );
    await tick();
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('runTurnDigestBeforeClose (fallback, 3 s cap)', () => {
  test('resolves as soon as a fast digest is applied', async () => {
    const applied: string[] = [];
    await runTurnDigestBeforeClose(
      { sessionId: 's1', userId: 'u1', messages: turn },
      3000,
      {
        generate: async () => digest,
        apply: async (sessionId) => {
          applied.push(sessionId);
        },
      }
    );
    expect(applied).toEqual(['s1']);
  });

  test('stops waiting at the cap, keeps the digest running and applies it later', async () => {
    let release: (d: typeof digest) => void = () => undefined;
    const pending = new Promise<typeof digest>((resolve) => {
      release = resolve;
    });
    const applied: string[] = [];
    const started = Date.now();
    await runTurnDigestBeforeClose(
      { sessionId: 's1', userId: 'u1', messages: turn },
      40,
      {
        generate: () => pending,
        apply: async (sessionId) => {
          applied.push(sessionId);
        },
      }
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(applied).toEqual([]);
    release(digest);
    await tick();
    await tick();
    expect(applied).toEqual(['s1']);
  });

  test('never rejects when the digest fails, and returns at once without an answer', async () => {
    await expect(
      runTurnDigestBeforeClose(
        { sessionId: 's1', userId: 'u1', messages: turn },
        3000,
        {
          generate: async () => {
            throw new Error('model down');
          },
          apply: async () => undefined,
        }
      )
    ).resolves.toBeUndefined();
    const generate = jest.fn(async () => digest);
    await runTurnDigestBeforeClose(
      { sessionId: 's1', userId: 'u1', messages: [turn[0]] },
      3000,
      { generate, apply: async () => undefined }
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
