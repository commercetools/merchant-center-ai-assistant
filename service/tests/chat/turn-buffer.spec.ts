/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  TurnBuffer,
  TurnRegistry,
  startMessageIdOf,
  stripProviderMetadata,
  type TurnEnd,
} from '../../src/chat/turn-buffer';

const frame = (part: unknown) => `data: ${JSON.stringify(part)}\n\n`;

const collect = () => {
  const frames: string[] = [];
  const ends: TurnEnd[] = [];
  return {
    frames,
    ends,
    subscriber: {
      onFrame: (f: string) => void frames.push(f),
      onEnd: (e: TurnEnd) => void ends.push(e),
    },
  };
};

afterEach(() => {
  jest.useRealTimers();
});

describe('stripProviderMetadata', () => {
  it('removes the top-level providerMetadata and nothing else', () => {
    const out = stripProviderMetadata(
      frame({
        type: 'tool-input-start',
        toolCallId: 'c1',
        providerMetadata: { vertex: { thoughtSignature: 'x'.repeat(100) } },
        toolMetadata: { title: 'Read Orders' },
      })
    );
    expect(out.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(out.slice(6))).toEqual({
      type: 'tool-input-start',
      toolCallId: 'c1',
      toolMetadata: { title: 'Read Orders' },
    });
  });

  it('keeps a nested providerMetadata (inside a tool output) untouched', () => {
    const f = frame({
      type: 'tool-output-available',
      output: { providerMetadata: 'kept' },
    });
    expect(stripProviderMetadata(f)).toBe(f);
  });

  it('keeps comments, the done marker and unparsable frames as they are', () => {
    for (const f of [': keep-alive\n\n', 'data: [DONE]\n\n', 'data: {"providerMetadata"\n\n']) {
      expect(stripProviderMetadata(f)).toBe(f);
    }
  });
});

describe('startMessageIdOf', () => {
  it('reads the id of a start frame', () => {
    expect(startMessageIdOf(frame({ type: 'start', messageId: 'm1' }))).toBe('m1');
  });

  it('ignores every other frame, including start-step', () => {
    for (const f of [
      frame({ type: 'start-step' }),
      frame({ type: 'text-delta', id: 't', delta: '"type":"start"' }),
      frame({ type: 'start' }),
      frame({ type: 'start', messageId: 7 }),
      ': keep-alive\n\n',
      'data: [DONE]\n\n',
      'data: {"type":"start","messageId"\n\n',
    ]) {
      expect(startMessageIdOf(f)).toBeUndefined();
    }
  });
});

describe('TurnBuffer', () => {
  it('replays what was buffered and then follows the live frames until the end', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    buffer.append(frame({ type: 'start', messageId: 'm1' }));
    buffer.append(frame({ type: 'text-start', id: 't' }));

    const follower = collect();
    expect(buffer.subscribe(follower.subscriber)).toBeDefined();
    expect(follower.frames).toHaveLength(2);

    buffer.append(frame({ type: 'text-delta', id: 't', delta: 'hi' }));
    buffer.append('data: [DONE]\n\n');
    buffer.finish();

    expect(follower.frames).toHaveLength(4);
    expect(follower.frames[0]).toContain('"messageId":"m1"');
    expect(follower.ends).toEqual(['done']);
  });

  it('serves a late subscriber the whole turn and ends it at once', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    buffer.append(frame({ type: 'start', messageId: 'm1' }));
    buffer.append('data: [DONE]\n\n');
    buffer.finish();

    const late = collect();
    buffer.subscribe(late.subscriber);
    expect(late.frames).toHaveLength(2);
    expect(late.ends).toEqual(['done']);
  });

  it('stops delivering to a subscriber that unsubscribed', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    const follower = collect();
    const stop = buffer.subscribe(follower.subscriber);
    buffer.append(frame({ type: 'start' }));
    stop?.();
    buffer.append(frame({ type: 'text-start', id: 't' }));
    expect(follower.frames).toHaveLength(1);
  });

  it('drops itself when it grows past the cap and aborts the followers', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined, 200);
    const follower = collect();
    buffer.subscribe(follower.subscriber);
    buffer.append(frame({ type: 'start' }));
    buffer.append(frame({ type: 'text-delta', id: 't', delta: 'x'.repeat(400) }));

    expect(buffer.isDropped).toBe(true);
    expect(follower.ends).toEqual(['aborted']);
    expect(buffer.subscribe(collect().subscriber)).toBeUndefined();
    // Frames after the drop are ignored, not thrown.
    expect(() => buffer.append(frame({ type: 'finish' }))).not.toThrow();
  });

  it('knows the message id of its turn from the first start frame only', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    expect(buffer.messageId).toBeUndefined();
    buffer.append(frame({ type: 'start-step' }));
    expect(buffer.messageId).toBeUndefined();
    buffer.append(frame({ type: 'start', messageId: 'm1' }));
    buffer.append(frame({ type: 'start', messageId: 'm2' }));
    expect(buffer.messageId).toBe('m1');
  });

  it('strips the provider metadata of the frames it keeps and serves', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    buffer.append(
      frame({
        type: 'tool-input-start',
        toolCallId: 'c1',
        providerMetadata: { vertex: { thoughtSignature: 'x'.repeat(500) } },
      })
    );
    const follower = collect();
    buffer.subscribe(follower.subscriber);
    expect(follower.frames[0]).not.toContain('providerMetadata');
    expect(follower.frames[0]).toContain('"toolCallId":"c1"');
    // The size counted is the stripped one.
    expect(buffer.byteSize).toBe(Buffer.byteLength(follower.frames[0]));
  });

  it('counts the connections it is serving until each is released', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    expect(buffer.followerCount).toBe(0);
    const first = buffer.holdFollower();
    const second = buffer.holdFollower();
    expect(buffer.followerCount).toBe(2);
    first();
    first(); // releasing twice counts once
    expect(buffer.followerCount).toBe(1);
    second();
    expect(buffer.followerCount).toBe(0);
  });

  it('keeps counting a connection after the turn it replays has finished', () => {
    const buffer = new TurnBuffer('s', 'u', () => undefined);
    const release = buffer.holdFollower();
    buffer.append(frame({ type: 'start', messageId: 'm1' }));
    buffer.finish();
    expect(buffer.followerCount).toBe(1);
    release();
    expect(buffer.followerCount).toBe(0);
  });

  it('has ended once finished, and also once dropped and then finished', () => {
    const finished = new TurnBuffer('s', 'u', () => undefined);
    expect(finished.hasEnded).toBe(false);
    finished.finish();
    expect(finished.hasEnded).toBe(true);
    expect(finished.isFinished).toBe(true);

    // A turn that grew too large is dropped while it runs, and it still ends.
    const dropped = new TurnBuffer('s', 'u', () => undefined, 50);
    dropped.append(frame({ type: 'text-delta', delta: 'x'.repeat(100) }));
    expect(dropped.isDropped).toBe(true);
    expect(dropped.hasEnded).toBe(false);
    dropped.finish();
    expect(dropped.hasEnded).toBe(true);
    expect(dropped.isFinished).toBe(false);
  });

  it('reports the bytes it gains and gives them back when dropped', () => {
    const deltas: number[] = [];
    const buffer = new TurnBuffer('s', 'u', () => undefined, 1000, (d) => void deltas.push(d));
    buffer.append('data: aaaa\n\n');
    buffer.append('data: bb\n\n');
    expect(deltas).toEqual([12, 10]);
    buffer.drop();
    expect(deltas).toEqual([12, 10, -22]);
    buffer.drop();
    expect(deltas).toHaveLength(3);
  });

  it('cancel runs the turn cancellation', () => {
    const cancel = jest.fn();
    new TurnBuffer('s', 'u', cancel).cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('TurnRegistry', () => {
  const options = { graceMs: 1000, maxTurns: 2, maxBytes: 1000 };

  it('replaces the previous turn of a session and aborts its followers', () => {
    const registry = new TurnRegistry(options);
    const first = registry.start('s', 'u', () => undefined);
    const follower = collect();
    first.subscribe(follower.subscriber);

    const second = registry.start('s', 'u', () => undefined);
    expect(registry.get('s')).toBe(second);
    expect(first.isDropped).toBe(true);
    expect(follower.ends).toEqual(['aborted']);
  });

  it('forgets a finished turn after the grace period, not before', () => {
    jest.useFakeTimers();
    const registry = new TurnRegistry(options);
    const turn = registry.start('s', 'u', () => undefined);
    registry.release(turn);
    expect(turn.isFinished).toBe(true);

    jest.advanceTimersByTime(999);
    expect(registry.get('s')).toBe(turn);
    jest.advanceTimersByTime(2);
    expect(registry.get('s')).toBeUndefined();
  });

  it('does not forget a newer turn when an older one expires', () => {
    jest.useFakeTimers();
    const registry = new TurnRegistry(options);
    const old = registry.start('s', 'u', () => undefined);
    registry.release(old);
    const fresh = registry.start('s', 'u', () => undefined);
    jest.advanceTimersByTime(5000);
    expect(registry.get('s')).toBe(fresh);
  });

  it('evicts a finished turn before one that is still running', () => {
    const registry = new TurnRegistry(options);
    registry.start('running', 'u', () => undefined);
    const done = registry.start('done', 'u', () => undefined);
    registry.release(done);
    registry.start('new', 'u', () => undefined);

    expect(registry.get('done')).toBeUndefined();
    expect(registry.get('running')).toBeDefined();
    expect(registry.get('new')).toBeDefined();
  });

  describe('byte budget', () => {
    const budgeted = { graceMs: 1000, maxTurns: 10, maxBytes: 1000, maxTotalBytes: 100 };
    const fill = (turn: TurnBuffer, bytes: number) =>
      turn.append(`data: ${'x'.repeat(bytes - 8)}\n\n`);

    it('forgets the oldest finished turn as soon as the frames held pass the budget', () => {
      const registry = new TurnRegistry(budgeted);
      const first = registry.start('a', 'u', () => undefined);
      fill(first, 60);
      registry.release(first);
      const second = registry.start('b', 'u', () => undefined);
      expect(registry.heldBytes()).toBe(60);

      // The second turn is still running when its frames tip the total over the budget.
      fill(second, 60);
      expect(registry.get('a')).toBeUndefined();
      expect(first.isDropped).toBe(true);
      expect(registry.get('b')).toBe(second);
      expect(registry.heldBytes()).toBe(60);
    });

    it('holds while many turns are running, not only when one starts or ends', () => {
      const registry = new TurnRegistry({ ...budgeted, maxTotalBytes: 100 });
      const turns = Array.from({ length: 10 }, (_, i) =>
        registry.start(`s${i}`, 'u', () => undefined)
      );
      for (const turn of turns) fill(turn, 40);

      expect(registry.heldBytes()).toBeLessThanOrEqual(100);
      // The turn that grew last is the one kept.
      expect(registry.get('s9')).toBe(turns[9]);
      expect(turns.filter((turn) => !turn.isDropped).length).toBeLessThanOrEqual(2);
    });

    it('never forgets the turn that grew, even when it alone is over the budget', () => {
      const registry = new TurnRegistry(budgeted);
      const big = registry.start('a', 'u', () => undefined);
      fill(big, 150);
      expect(registry.get('a')).toBe(big);
      expect(big.isDropped).toBe(false);
    });

    it('forgets a finished turn before a running one', () => {
      const registry = new TurnRegistry(budgeted);
      const running = registry.start('a', 'u', () => undefined);
      fill(running, 50);
      const finished = registry.start('b', 'u', () => undefined);
      fill(finished, 30);
      registry.release(finished);
      expect(registry.get('b')).toBe(finished);

      const newest = registry.start('c', 'u', () => undefined);
      fill(newest, 40);
      // 50 + 30 + 40 > 100: the finished turn goes, the running one stays.
      expect(registry.get('b')).toBeUndefined();
      expect(registry.get('a')).toBe(running);
      expect(running.isDropped).toBe(false);
      expect(registry.get('c')).toBe(newest);
    });

    it('forgets a running turn only when no finished one is left to forget', () => {
      const registry = new TurnRegistry(budgeted);
      const running = registry.start('a', 'u', () => undefined);
      fill(running, 80);
      const newest = registry.start('b', 'u', () => undefined);
      fill(newest, 60);

      expect(running.isDropped).toBe(true);
      expect(registry.get('a')).toBeUndefined();
      expect(registry.get('b')).toBe(newest);
    });

    it('treats a turn that grew too large and then ended as ended, not as running', () => {
      const registry = new TurnRegistry({ ...budgeted, maxBytes: 50, maxTurns: 2 });
      // The running turn comes first in eviction order, so a wrong ranking would pick it.
      const running = registry.start('running', 'u', () => undefined);
      const oversize = registry.start('oversize', 'u', () => undefined);
      fill(oversize, 80); // over the cap of one turn: dropped while it runs
      expect(oversize.isDropped).toBe(true);
      registry.release(oversize);
      expect(oversize.hasEnded).toBe(true);

      registry.start('new', 'u', () => undefined); // over the cap of two turns: one must go
      expect(registry.get('oversize')).toBeUndefined(); // the ended one, not the running one
      expect(registry.get('running')).toBe(running);
      expect(running.isDropped).toBe(false);
    });

    it('stops counting the bytes of a turn that is forgotten after its grace period', () => {
      jest.useFakeTimers();
      const registry = new TurnRegistry(budgeted);
      const turn = registry.start('a', 'u', () => undefined);
      fill(turn, 60);
      registry.release(turn);
      expect(registry.heldBytes()).toBe(60);
      jest.advanceTimersByTime(1001);
      expect(registry.get('a')).toBeUndefined();
      expect(registry.heldBytes()).toBe(0);
    });

    it('counts nothing after clear', () => {
      const registry = new TurnRegistry(budgeted);
      fill(registry.start('a', 'u', () => undefined), 60);
      registry.clear();
      expect(registry.heldBytes()).toBe(0);
    });
  });

  it('evicts the oldest turn beyond the cap', () => {
    const registry = new TurnRegistry(options);
    registry.start('a', 'u', () => undefined);
    registry.start('b', 'u', () => undefined);
    registry.start('c', 'u', () => undefined);
    expect(registry.size()).toBe(2);
    expect(registry.get('a')).toBeUndefined();
    expect(registry.get('c')).toBeDefined();
  });
});
