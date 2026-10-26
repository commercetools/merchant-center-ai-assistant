/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { UIMessage } from '@ai-sdk/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  findStoredAnswer,
  isConnectionDrop,
  MAX_POLLS,
  MAX_RESUMES,
  POLL_INTERVAL_MS,
  RESUME_DELAY_MS,
  resolveTiming,
  sameConversation,
  snapshotOf,
  useStreamRecovery,
  type DropSnapshot,
  type StreamRecoveryDeps,
} from './use-stream-recovery';

// Jest fake timers do not take effect under this preset, so the hook's schedule is shortened
// through `timing` and the tests run on real timers.
const TIMING = {
  maxResumes: 2,
  resumeDelayMs: 5,
  pollIntervalMs: 10,
  maxPolls: 4,
};

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const message = (
  id: string,
  role: UIMessage['role'],
  text = id
): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

const asked = [message('u1', 'user')];
const partial = [...asked, message('a1', 'assistant', 'partial')];
const snapshot: DropSnapshot = snapshotOf(partial);
const stored = [...asked, message('a1', 'assistant', 'the whole answer')];

describe('snapshotOf', () => {
  it('remembers the assistant message that was streaming and every known id', () => {
    expect(snapshotOf(partial)).toEqual({
      assistantId: 'a1',
      knownIds: new Set(['u1', 'a1']),
    });
  });

  it('has no assistant id when the last message is the user’s', () => {
    expect(snapshotOf(asked).assistantId).toBeUndefined();
  });

  it('copes with an empty chat', () => {
    expect(snapshotOf([])).toEqual({
      assistantId: undefined,
      knownIds: new Set(),
    });
  });
});

describe('sameConversation', () => {
  it('is true for two views of one transcript', () => {
    expect(sameConversation(partial, [...partial, message('u2', 'user')])).toBe(
      true
    );
  });

  it('is false for another chat', () => {
    expect(sameConversation(partial, [message('x1', 'user')])).toBe(false);
  });

  it('is false when either has no messages', () => {
    expect(sameConversation([], partial)).toBe(false);
    expect(sameConversation(partial, [])).toBe(false);
    expect(sameConversation([], [])).toBe(false);
  });
});

describe('findStoredAnswer', () => {
  it('finds the answer stored under the id that was streaming', () => {
    expect(findStoredAnswer(stored, snapshot)?.parts).toEqual([
      { type: 'text', text: 'the whole answer' },
    ]);
  });

  it('finds an assistant message the client did not have, whatever its id', () => {
    const other = [...asked, message('a9', 'assistant', 'stored elsewhere')];
    expect(findStoredAnswer(other, snapshotOf(asked))?.id).toBe('a9');
  });

  it('ignores an older answer the client already had', () => {
    const history = [
      message('u0', 'user'),
      message('a0', 'assistant'),
      ...asked,
    ];
    expect(findStoredAnswer(history, snapshotOf(history))).toBeUndefined();
  });

  it('never takes an earlier answer for the one being streamed, even one the client no longer shows', () => {
    // Try again removed a0 from the client's list, but the service still stores it.
    const retried = snapshotOf([
      message('u1', 'user'),
      message('a1', 'assistant', 'partial'),
    ]);
    const storedSoFar = [
      message('u1', 'user'),
      message('a0', 'assistant', 'the old answer'),
    ];
    expect(retried.assistantId).toBe('a1');
    expect(retried.knownIds.has('a0')).toBe(false);
    expect(findStoredAnswer(storedSoFar, retried)).toBeUndefined();

    // Once the answer being streamed is stored it is found, whatever else is stored.
    const nowStored = [
      ...storedSoFar,
      message('a1', 'assistant', 'the new answer'),
    ];
    expect(findStoredAnswer(nowStored, retried)?.id).toBe('a1');
  });

  it('is undefined while the turn is not stored yet', () => {
    expect(findStoredAnswer(asked, snapshot)).toBeUndefined();
  });

  it('never returns a user message', () => {
    expect(
      findStoredAnswer([message('u2', 'user')], snapshotOf(asked))
    ).toBeUndefined();
  });
});

const createMocks = () => ({
  resumeStream: jest.fn().mockResolvedValue(undefined),
  getMessages: jest.fn().mockResolvedValue({ success: true, data: stored }),
  cancelTurn: jest.fn().mockResolvedValue({ success: true }),
  applyStored: jest.fn(),
  onRecovered: jest.fn(),
  onGiveUp: jest.fn(),
});

describe('isConnectionDrop', () => {
  const finish = {
    message: partial[1],
    isError: true,
    isAbort: false,
    isDisconnect: false,
    error: new TypeError('network error') as Error | undefined,
  };

  it('is a drop when the gateway cuts the response (a bare TypeError)', () => {
    expect(isConnectionDrop(finish)).toBe(true);
  });

  it('is a drop when the SDK flags a disconnect', () => {
    expect(
      isConnectionDrop({
        ...finish,
        isDisconnect: true,
        error: new Error('whatever'),
      })
    ).toBe(true);
  });

  it('is not a drop when nothing failed', () => {
    expect(isConnectionDrop({ ...finish, isError: false })).toBe(false);
  });

  it('is not a drop when the user pressed stop', () => {
    expect(isConnectionDrop({ ...finish, isAbort: true })).toBe(false);
  });

  it('is not a drop when the service reported an error itself', () => {
    expect(
      isConnectionDrop({ ...finish, error: new Error('Model unavailable') })
    ).toBe(false);
    expect(isConnectionDrop({ ...finish, error: undefined })).toBe(false);
  });

  it('is a drop before any part arrived when the request is a reattach of a running recovery', () => {
    const empty = { id: 'a1', role: 'assistant' as const, parts: [] };
    expect(
      isConnectionDrop({ ...finish, message: empty, recovering: true })
    ).toBe(true);
    expect(
      isConnectionDrop({ ...finish, message: empty, recovering: false })
    ).toBe(false);
  });

  it('still needs a connection failure while recovering', () => {
    const empty = { id: 'a1', role: 'assistant' as const, parts: [] };
    expect(
      isConnectionDrop({
        ...finish,
        message: empty,
        recovering: true,
        error: new Error('Model unavailable'),
      })
    ).toBe(false);
    expect(
      isConnectionDrop({
        ...finish,
        message: empty,
        recovering: true,
        isAbort: true,
      })
    ).toBe(false);
  });

  it('is not a drop before any part of the answer arrived (that keeps the retry)', () => {
    expect(
      isConnectionDrop({
        ...finish,
        message: { id: 'a1', role: 'assistant', parts: [] },
      })
    ).toBe(false);
  });
});

describe('useStreamRecovery', () => {
  const setup = (replace: Partial<ReturnType<typeof createMocks>> = {}) => {
    const mocks = { ...createMocks(), ...replace };
    const deps: StreamRecoveryDeps = {
      sessionId: 's1',
      timing: TIMING,
      ...mocks,
    };
    const hook = renderHook(
      (props: StreamRecoveryDeps) => useStreamRecovery(props),
      { initialProps: deps }
    );
    return {
      mocks,
      deps,
      // What the chat's onFinish does at the end of a replayed stream.
      finishOnResume: () =>
        mocks.resumeStream.mockImplementation(async () => {
          hook.result.current.noteFinish();
        }),
      ...hook,
    };
  };

  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.isRecovering).toBe(false);
  });

  it('reattaches with resumeStream after a drop', async () => {
    const { result, mocks } = setup();
    act(() => result.current.handleDrop(snapshot));
    expect(result.current.isRecovering).toBe(true);
    await waitFor(() => expect(mocks.resumeStream).toHaveBeenCalledTimes(1));
  });

  it('does not read stored messages when the reattached stream finished', async () => {
    const { result, mocks, finishOnResume } = setup();
    finishOnResume();
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.resumeStream).toHaveBeenCalledTimes(1));
    await sleep(TIMING.pollIntervalMs * 3);
    expect(mocks.getMessages).not.toHaveBeenCalled();
    expect(mocks.onGiveUp).not.toHaveBeenCalled();
  });

  it('falls back to the stored answer when there is nothing to reattach to', async () => {
    // resumeStream resolves without onFinish: the service answered 204.
    const { result, mocks } = setup();
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.onRecovered).toHaveBeenCalledTimes(1));
    expect(mocks.applyStored).toHaveBeenCalledWith(stored[1]);
    expect(mocks.getMessages).toHaveBeenCalledWith('s1');
    expect(result.current.isRecovering).toBe(false);
  });

  it('falls back to the stored answer when the reattach cannot connect', async () => {
    const { result, mocks } = setup({
      resumeStream: jest
        .fn()
        .mockRejectedValue(new TypeError('Failed to fetch')),
    });
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.onRecovered).toHaveBeenCalledTimes(1));
    expect(mocks.applyStored).toHaveBeenCalledTimes(1);
  });

  it('keeps polling until the answer is stored', async () => {
    const getMessages = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: asked })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ success: true, data: stored });
    const { result, mocks } = setup({ getMessages });
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.onRecovered).toHaveBeenCalledTimes(1));
    expect(getMessages).toHaveBeenCalledTimes(3);
  });

  it('gives up when the answer never shows up', async () => {
    const getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: asked });
    const { result, mocks } = setup({ getMessages });
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.onGiveUp).toHaveBeenCalledTimes(1));
    expect(getMessages).toHaveBeenCalledTimes(TIMING.maxPolls);
    expect(mocks.applyStored).not.toHaveBeenCalled();
    expect(mocks.onRecovered).not.toHaveBeenCalled();
    expect(result.current.isRecovering).toBe(false);
  });

  it('stops reattaching after maxResumes drops in a row and polls instead', async () => {
    const getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: asked });
    const { result, mocks, finishOnResume } = setup({ getMessages });
    // Every reattached stream is cut again: onFinish ran and reported the next drop.
    finishOnResume();
    for (let drop = 0; drop < TIMING.maxResumes; drop += 1) {
      act(() => result.current.handleDrop(snapshot));
      await waitFor(() =>
        expect(mocks.resumeStream).toHaveBeenCalledTimes(drop + 1)
      );
    }
    mocks.resumeStream.mockClear();
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    expect(mocks.resumeStream).not.toHaveBeenCalled();
  });

  it('settle ends the recovering state and gives the reattach attempts back', async () => {
    const { result, mocks, finishOnResume } = setup();
    finishOnResume();
    // Use up every reattach of the recovery: each is cut again and reported as another drop.
    for (let drop = 0; drop < TIMING.maxResumes; drop += 1) {
      act(() => result.current.handleDrop(snapshot));
      await waitFor(() =>
        expect(mocks.resumeStream).toHaveBeenCalledTimes(drop + 1)
      );
    }
    expect(result.current.isRecovering).toBe(true);

    act(() => result.current.settle());
    expect(result.current.isRecovering).toBe(false);

    // A later turn that drops may reattach again; without the reset it would only poll.
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() =>
      expect(mocks.resumeStream).toHaveBeenCalledTimes(TIMING.maxResumes + 1)
    );
  });

  it('settle also ends a poll that is still waiting for the stored answer', async () => {
    // Resolves on the first read, so settle() lands in the middle of the poll.
    let firstRead!: () => void;
    const firstReadSeen = new Promise<void>((resolve) => {
      firstRead = resolve;
    });
    const getMessages = jest.fn(async () => {
      firstRead();
      return { success: true, data: asked };
    });
    const { result, mocks } = setup({ getMessages });
    act(() => result.current.handleDrop(snapshot));
    await firstReadSeen;

    // Another stream (a new run, say) finished normally and told the hook so.
    act(() => result.current.settle());
    getMessages.mockImplementation(async () => ({
      success: true,
      data: stored,
    }));
    await sleep(TIMING.pollIntervalMs * (TIMING.maxPolls + 2));

    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(mocks.applyStored).not.toHaveBeenCalled();
    expect(mocks.onRecovered).not.toHaveBeenCalled();
    expect(mocks.onGiveUp).not.toHaveBeenCalled();
  });

  it('knows whether a recovery is running', async () => {
    const { result, mocks } = setup();
    expect(result.current.isActive()).toBe(false);
    act(() => result.current.handleDrop(snapshot));
    expect(result.current.isActive()).toBe(true);
    await waitFor(() => expect(mocks.onRecovered).toHaveBeenCalledTimes(1));
    expect(result.current.isActive()).toBe(false);

    act(() => result.current.handleDrop(snapshot));
    expect(result.current.isActive()).toBe(true);
    act(() => result.current.settle());
    expect(result.current.isActive()).toBe(false);
  });

  it('hands over when the connection was first lost', async () => {
    const { result, mocks, finishOnResume } = setup();
    finishOnResume();
    const firstDrop = Date.now();
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.resumeStream).toHaveBeenCalledTimes(1));

    // The reattach is cut again, much later: another drop in the same recovery.
    await sleep(80);
    mocks.resumeStream.mockImplementation(async () => undefined);
    act(() => result.current.handleDrop(snapshot));
    await waitFor(() => expect(mocks.onRecovered).toHaveBeenCalledTimes(1));

    const [droppedAt] = mocks.onRecovered.mock.calls[0] as [number];
    expect(droppedAt).toBeGreaterThanOrEqual(firstDrop);
    // The second drop came at least 80 ms later; the hand-over still names the first.
    expect(droppedAt).toBeLessThan(firstDrop + 60);
    expect(result.current.droppedAt()).toBe(droppedAt);
  });

  it('does nothing for a drop that arrives after unmount', async () => {
    const { result, mocks, unmount } = setup();
    const { handleDrop } = result.current;
    unmount();
    handleDrop(snapshot);
    await sleep(TIMING.pollIntervalMs * 4);
    expect(mocks.resumeStream).not.toHaveBeenCalled();
    expect(mocks.getMessages).not.toHaveBeenCalled();
    expect(mocks.onGiveUp).not.toHaveBeenCalled();
  });

  describe('stop', () => {
    it('stops the model run on the service for this session', () => {
      const { result, mocks } = setup();
      act(() => result.current.handleDrop(snapshot));
      act(() => result.current.stop());
      expect(mocks.cancelTurn).toHaveBeenCalledWith('s1', undefined);
      expect(result.current.isRecovering).toBe(false);
    });

    it('names the turn it stops', () => {
      const { result, mocks } = setup();
      act(() => result.current.stop('a1'));
      expect(mocks.cancelTurn).toHaveBeenCalledWith('s1', 'a1');
    });

    it('ends the loops: nothing is reattached, read or applied afterwards', async () => {
      const { result, mocks } = setup();
      act(() => result.current.handleDrop(snapshot));
      act(() => result.current.stop());
      await sleep(TIMING.pollIntervalMs * 4);
      expect(mocks.resumeStream).not.toHaveBeenCalled();
      expect(mocks.getMessages).not.toHaveBeenCalled();
      expect(mocks.applyStored).not.toHaveBeenCalled();
      expect(mocks.onGiveUp).not.toHaveBeenCalled();
    });

    it('stops a poll that is already running', async () => {
      // Resolves on the first read, so stop() lands in the middle of the poll.
      let firstRead!: () => void;
      const firstReadSeen = new Promise<void>((resolve) => {
        firstRead = resolve;
      });
      const getMessages = jest.fn(async () => {
        firstRead();
        return { success: true, data: asked };
      });
      const { result, mocks } = setup({ getMessages });
      act(() => result.current.handleDrop(snapshot));
      await firstReadSeen;
      act(() => result.current.stop());
      await sleep(TIMING.pollIntervalMs * (TIMING.maxPolls + 2));
      expect(getMessages).toHaveBeenCalledTimes(1);
      expect(mocks.onGiveUp).not.toHaveBeenCalled();
      expect(mocks.applyStored).not.toHaveBeenCalled();
    });

    it('does not fail when the service cannot be told', async () => {
      const { result, mocks } = setup({
        cancelTurn: jest.fn().mockRejectedValue(new Error('offline')),
      });
      act(() => result.current.stop());
      await sleep(5);
      expect(mocks.cancelTurn).toHaveBeenCalledTimes(1);
      expect(result.current.isRecovering).toBe(false);
    });
  });

  it('reset ends the loops without telling the service', async () => {
    const { result, mocks } = setup();
    act(() => result.current.handleDrop(snapshot));
    act(() => result.current.reset());
    await sleep(TIMING.pollIntervalMs * 4);
    expect(mocks.cancelTurn).not.toHaveBeenCalled();
    expect(mocks.resumeStream).not.toHaveBeenCalled();
    expect(mocks.applyStored).not.toHaveBeenCalled();
  });

  it('ends the loops when the chat switches to another session', async () => {
    const { result, mocks, deps, rerender } = setup();
    act(() => result.current.handleDrop(snapshot));
    rerender({ ...deps, sessionId: 's2' });
    await sleep(TIMING.pollIntervalMs * 4);
    expect(mocks.applyStored).not.toHaveBeenCalled();
    expect(result.current.isRecovering).toBe(false);
  });

  it('ends the loops on unmount', async () => {
    const { result, mocks, unmount } = setup();
    act(() => result.current.handleDrop(snapshot));
    unmount();
    await sleep(TIMING.pollIntervalMs * 4);
    expect(mocks.applyStored).not.toHaveBeenCalled();
    expect(mocks.onGiveUp).not.toHaveBeenCalled();
  });
});

describe('the schedule the app runs with', () => {
  it('is the one the documentation states: 3 reattaches, then up to 5 minutes of reads', () => {
    expect(MAX_RESUMES).toBe(3);
    expect(RESUME_DELAY_MS).toBe(500);
    expect(POLL_INTERVAL_MS).toBe(4_000);
    expect(POLL_INTERVAL_MS * MAX_POLLS).toBe(300_000);
  });

  it('is what the hook uses unless it is told otherwise', () => {
    expect(resolveTiming()).toEqual({
      maxResumes: MAX_RESUMES,
      resumeDelayMs: RESUME_DELAY_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      maxPolls: MAX_POLLS,
    });
    expect(resolveTiming({ maxPolls: 2 })).toEqual({
      maxResumes: MAX_RESUMES,
      resumeDelayMs: RESUME_DELAY_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      maxPolls: 2,
    });
  });
});
