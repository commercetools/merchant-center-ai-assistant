/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  cancelChatStream,
  followTurn,
  replayChatStream,
  type FollowerSink,
} from '../../src/chat/stream-resume.controller';
import {
  MAX_TURN_BYTES,
  TurnBuffer,
  turnRegistry,
} from '../../src/chat/turn-buffer';
import { MAX_FOLLOWERS_PER_TURN } from '../../src/chat/stream-resume.controller';

const frame = (part: unknown) => `data: ${JSON.stringify(part)}\n\n`;

afterEach(() => {
  turnRegistry.clear();
});

/** A connection that can be told to stop accepting writes, until it drains. */
const makeSink = () => {
  const writes: string[] = [];
  let drain: (() => void) | undefined;
  const sink = {
    accepting: true,
    destroyed: false,
    ended: 0,
    writes,
    write(chunk: string) {
      writes.push(chunk);
      return sink.accepting;
    },
    end() {
      sink.ended += 1;
    },
    destroy() {
      sink.destroyed = true;
    },
    once(_event: 'drain', listener: () => void) {
      drain = listener;
    },
    drain() {
      sink.accepting = true;
      const listener = drain;
      drain = undefined;
      listener?.();
    },
  };
  return sink satisfies FollowerSink & Record<string, unknown>;
};

describe('followTurn', () => {
  it('writes what the turn already has, then the live frames, then ends once', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    turn.append(frame({ type: 'start', messageId: 'm1' }));
    const sink = makeSink();

    expect(followTurn(turn, sink)).toBeDefined();
    turn.append(frame({ type: 'text-start', id: 't' }));
    turn.append('data: [DONE]\n\n');
    turn.finish();

    expect(sink.writes).toHaveLength(3);
    expect(sink.writes[0]).toContain('"messageId":"m1"');
    expect(sink.ended).toBe(1);
  });

  it('writes nothing more to a connection that has not taken the last frame, until it drains', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    const sink = makeSink();
    followTurn(turn, sink);

    turn.append(frame({ n: 1 }));
    sink.accepting = false;
    turn.append(frame({ n: 2 })); // written, and refused
    turn.append(frame({ n: 3 }));
    turn.append(frame({ n: 4 }));
    expect(sink.writes).toHaveLength(2);

    sink.drain();
    expect(sink.writes).toHaveLength(4);
    expect(sink.writes.map((w) => JSON.parse(w.slice(6)).n)).toEqual([1, 2, 3, 4]);
  });

  it('gives a stalled connection nothing more, however many frames arrive, until it drains', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    turn.append(frame({ type: 'start' }));
    const sink = makeSink();
    sink.accepting = false;
    followTurn(turn, sink);
    for (let i = 0; i < 50; i += 1) turn.append(frame({ n: i, pad: 'x'.repeat(1000) }));

    // Only the first write reached the connection; the rest wait, one pointer each.
    expect(sink.writes).toHaveLength(1);

    sink.drain();
    expect(sink.writes).toHaveLength(51);
    expect(sink.writes.slice(1).map((w) => JSON.parse(w.slice(6)).n)).toEqual(
      Array.from({ length: 50 }, (_, i) => i)
    );
  });

  it('ends only after the backlog is written', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    const sink = makeSink();
    followTurn(turn, sink);
    sink.accepting = false;
    turn.append(frame({ n: 1 }));
    turn.append(frame({ n: 2 }));
    turn.finish();
    expect(sink.ended).toBe(0);

    sink.drain();
    expect(sink.writes).toHaveLength(2);
    expect(sink.ended).toBe(1);
  });

  it('destroys the connection and drops the backlog when the buffer is dropped', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    const sink = makeSink();
    followTurn(turn, sink);
    sink.accepting = false;
    turn.append(frame({ n: 1 }));
    turn.append(frame({ n: 2 }));

    turn.drop();
    expect(sink.destroyed).toBe(true);
    expect(sink.ended).toBe(0);
  });

  it('destroys the connection and returns nothing for a turn that cannot be followed', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    turn.drop();
    const sink = makeSink();
    expect(followTurn(turn, sink)).toBeUndefined();
    expect(sink.destroyed).toBe(true);
  });

  it('does not subscribe a connection that is already gone', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    const sink = makeSink();
    sink.destroyed = true;
    expect(followTurn(turn, sink)).toBeUndefined();
    turn.append(frame({ n: 1 }));
    expect(sink.writes).toEqual([]);
  });

  it('stops following when asked to', () => {
    const turn = new TurnBuffer('s', 'u', () => undefined);
    const sink = makeSink();
    const stop = followTurn(turn, sink);
    turn.append(frame({ n: 1 }));
    stop?.();
    turn.append(frame({ n: 2 }));
    expect(sink.writes).toHaveLength(1);
  });
});

/** The parts of a request and a response the two handlers touch. */
const call = (
  handler: (req: Request, res: Response, next: () => void) => unknown,
  sessionId: string,
  userId: string,
  query: Record<string, string> = {},
  gone = false
) => {
  const closeListeners: Array<() => void> = [];
  const out = {
    status: 0,
    body: undefined as unknown,
    writes: [] as string[],
    destroyed: gone,
    /** The connection ends: what Node does when the client goes away or the response is over. */
    close() {
      out.destroyed = true;
      for (const listener of closeListeners.splice(0)) listener();
    },
  };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    end() {
      return res;
    },
    setHeader() {
      return res;
    },
    flushHeaders() {
      return undefined;
    },
    write(chunk: string) {
      out.writes.push(chunk);
      return true;
    },
    destroy() {
      out.destroyed = true;
    },
    once(event: string, listener: () => void) {
      if (event === 'close') closeListeners.push(listener);
      return res;
    },
    on(event: string, listener: () => void) {
      if (event === 'close') closeListeners.push(listener);
      return res;
    },
    get destroyed() {
      return out.destroyed;
    },
  };
  handler(
    { params: { sessionId }, query, user: { userId }, destroyed: gone } as unknown as Request,
    res as unknown as Response,
    () => undefined
  );
  return out;
};

describe('ownership of a turn (the buffer’s own check, behind loadSession)', () => {
  it('replays a turn to its user only', () => {
    const turn = turnRegistry.start('s1', 'alice', () => undefined);
    turn.append(frame({ type: 'start', messageId: 'm1' }));

    const stranger = call(replayChatStream, 's1', 'mallory');
    expect(stranger.status).toBe(204);
    expect(stranger.writes).toEqual([]);

    const owner = call(replayChatStream, 's1', 'alice');
    expect(owner.status).toBe(200);
    expect(owner.writes).toHaveLength(1);
  });

  it('stops a turn for its user only', () => {
    const cancel = jest.fn();
    turnRegistry.start('s1', 'alice', cancel);

    const stranger = call(cancelChatStream, 's1', 'mallory');
    expect(stranger.body).toEqual({ success: true, message: 'Nothing to stop' });
    expect(cancel).not.toHaveBeenCalled();

    const owner = call(cancelChatStream, 's1', 'alice');
    expect(owner.body).toEqual({ success: true, message: 'Stopped' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not stop a finished turn', () => {
    const cancel = jest.fn();
    const turn = turnRegistry.start('s1', 'alice', cancel);
    turnRegistry.release(turn);
    const out = call(cancelChatStream, 's1', 'alice');
    expect(out.body).toEqual({ success: true, message: 'Nothing to stop' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('accepts a named turn only when it is the running one', () => {
    const cancel = jest.fn();
    const turn = turnRegistry.start('s1', 'alice', cancel);
    turn.append(frame({ type: 'start', messageId: 'm1' }));

    expect(call(replayChatStream, 's1', 'alice', { messageId: 'm2' }).status).toBe(204);
    expect(call(cancelChatStream, 's1', 'alice', { messageId: 'm2' }).body).toEqual({
      success: true,
      message: 'Nothing to stop',
    });
    expect(cancel).not.toHaveBeenCalled();

    expect(call(replayChatStream, 's1', 'alice', { messageId: 'm1' }).status).toBe(200);
    expect(call(cancelChatStream, 's1', 'alice', { messageId: 'm1' }).body).toEqual({
      success: true,
      message: 'Stopped',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('answers nothing and counts nothing for a connection that is already gone', () => {
    const turn = turnRegistry.start('s1', 'alice', () => undefined);
    turn.append(frame({ type: 'start', messageId: 'm1' }));
    const out = call(replayChatStream, 's1', 'alice', {}, true);
    expect(out.status).toBe(0);
    expect(out.writes).toEqual([]);
    expect(turn.followerCount).toBe(0);
  });

  it('counts a replay until its connection closes, a finished turn’s included', () => {
    const turn = turnRegistry.start('s1', 'alice', () => undefined);
    turn.append(frame({ type: 'start', messageId: 'm1' }));
    turnRegistry.release(turn);

    const open = Array.from({ length: MAX_FOLLOWERS_PER_TURN }, () =>
      call(replayChatStream, 's1', 'alice')
    );
    expect(open.map((out) => out.status)).toEqual(
      Array(MAX_FOLLOWERS_PER_TURN).fill(200)
    );
    expect(turn.followerCount).toBe(MAX_FOLLOWERS_PER_TURN);
    expect(call(replayChatStream, 's1', 'alice').status).toBe(204);

    open[0].close();
    expect(turn.followerCount).toBe(MAX_FOLLOWERS_PER_TURN - 1);
    expect(call(replayChatStream, 's1', 'alice').status).toBe(200);
  });

  it('does not stop a turn that ended after growing too large to replay', () => {
    const cancel = jest.fn();
    const turn = turnRegistry.start('s1', 'alice', cancel);
    turn.append(`data: ${'x'.repeat(MAX_TURN_BYTES + 10)}\n\n`);
    expect(turn.isDropped).toBe(true);
    turnRegistry.release(turn);

    const out = call(cancelChatStream, 's1', 'alice');
    expect(out.body).toEqual({ success: true, message: 'Nothing to stop' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('treats a turn that has not shown its id yet as the one the browser means', () => {
    const cancel = jest.fn();
    turnRegistry.start('s1', 'alice', cancel);
    expect(call(cancelChatStream, 's1', 'alice', { messageId: 'm1' }).body).toEqual({
      success: true,
      message: 'Stopped',
    });
  });
});
