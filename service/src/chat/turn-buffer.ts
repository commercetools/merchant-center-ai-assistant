/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The replay buffer of a chat turn.
 *
 * Why it exists: the Merchant Center gateway ends a response after about 120 s, while a turn
 * may run for four minutes. The service keeps producing and stores the answer, but the
 * browser loses the stream. The AI SDK's `resumeStream()` reconnects with a GET and expects
 * the WHOLE message again (there is no offset), so every SSE frame of the running turn is
 * kept here and replayed to a reconnecting client before it follows the live frames.
 *
 * Process memory only, by design: the service is stateless, so a reconnect that reaches
 * another instance finds nothing and answers 204, which the client treats as "fall back to
 * the stored answer". Nothing here is a source of truth; the turn is persisted by
 * `onFinish` as before.
 */

/** Frames beyond this size make the turn unreplayable (a 258 s turn is about 0.2 MB). */
export const MAX_TURN_BYTES = 8 * 1024 * 1024;
/** A finished turn stays replayable this long, so a reconnect just after the end still works. */
export const TURN_GRACE_MS = 120_000;
/** Upper bound of buffers held by one process. */
export const MAX_TURNS = 256;
/**
 * Upper bound of the frames held by one process in all. A count alone is not a memory
 * bound: a turn that exports data carries a payload of several MB in one frame.
 */
export const MAX_TOTAL_BYTES = 96 * 1024 * 1024;

const DATA_PREFIX = 'data: ';

/**
 * Drops the top-level `providerMetadata` of a frame. It is more than half of the bytes of a
 * turn (every tool call repeats a 1.6 KB model signature three times, under two provider
 * keys) and nothing in the apps reads it: the browser sends only its last message back and
 * the history is rebuilt from storage.
 */
export const stripProviderMetadata = (frame: string): string => {
  if (!frame.startsWith(DATA_PREFIX) || !frame.includes('"providerMetadata"')) {
    return frame;
  }
  const end = frame.endsWith('\n\n') ? frame.length - 2 : frame.length;
  try {
    const part: unknown = JSON.parse(frame.slice(DATA_PREFIX.length, end));
    if (part && typeof part === 'object' && 'providerMetadata' in part) {
      delete (part as Record<string, unknown>).providerMetadata;
      return `${DATA_PREFIX}${JSON.stringify(part)}\n\n`;
    }
  } catch {
    // Not JSON (a comment or the [DONE] marker): keep the frame as it is.
  }
  return frame;
};

/**
 * The id of the assistant message a turn builds, read from its `start` frame. The browser
 * names it when it reattaches or stops, so a reply can never be served for, or a stop applied
 * to, another turn of the same session. `undefined` for any other frame.
 */
export const startMessageIdOf = (frame: string): string | undefined => {
  // The closing quote keeps `start-step` out.
  if (!frame.startsWith(DATA_PREFIX) || !frame.includes('"type":"start"')) {
    return undefined;
  }
  const end = frame.endsWith('\n\n') ? frame.length - 2 : frame.length;
  try {
    const part: unknown = JSON.parse(frame.slice(DATA_PREFIX.length, end));
    if (part && typeof part === 'object') {
      const { type, messageId } = part as Record<string, unknown>;
      if (type === 'start' && typeof messageId === 'string') return messageId;
    }
  } catch {
    // Not JSON: not a start frame.
  }
  return undefined;
};

/** `done`: the turn ended and every frame was delivered. `aborted`: the buffer was dropped. */
export type TurnEnd = 'done' | 'aborted';

export interface TurnSubscriber {
  onFrame: (frame: string) => void;
  onEnd: (end: TurnEnd) => void;
}

export class TurnBuffer {
  private readonly frames: string[] = [];
  private bytes = 0;
  private readonly subscribers = new Set<TurnSubscriber>();
  private finished = false;
  private dropped = false;
  private startedMessageId: string | undefined;
  private ended = false;
  private followers = 0;

  constructor(
    readonly sessionId: string,
    /** Verified id of the user whose turn this is; a replay is only served to that user. */
    readonly userId: string,
    private readonly cancelTurn: () => void,
    private readonly maxBytes: number = MAX_TURN_BYTES,
    /** Told every change of the bytes held (positive when frames arrive, negative on drop). */
    private readonly onBytes: (delta: number) => void = () => undefined
  ) {}

  /** True once a complete replay of the whole turn is available. */
  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * True once the model run is over, whether or not a complete replay exists (a turn that
   * grew too large is dropped, and still ends). A stop has nothing to do after this.
   */
  get hasEnded(): boolean {
    return this.ended;
  }

  /** Id of the assistant message of this turn; unknown until its `start` frame has passed. */
  get messageId(): string | undefined {
    return this.startedMessageId;
  }

  /** Bytes of the frames held. */
  get byteSize(): number {
    return this.bytes;
  }

  /** Connections currently held by a replay, running or finished. */
  get followerCount(): number {
    return this.followers;
  }

  /**
   * Counts one connection that is being served this turn, until the returned function is
   * called (once the connection is gone). The cap on followers is read from this count, and
   * it includes a replay of a finished turn, which is not a subscriber but holds the frames
   * for as long as the connection takes to read them.
   */
  holdFollower(): () => void {
    this.followers += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.followers -= 1;
    };
  }

  /** True once the buffer can no longer serve a complete replay. */
  get isDropped(): boolean {
    return this.dropped;
  }

  append(rawFrame: string): void {
    if (this.finished || this.dropped) return;
    const frame = stripProviderMetadata(rawFrame);
    const size = Buffer.byteLength(frame);
    if (this.bytes + size > this.maxBytes) {
      this.drop();
      return;
    }
    this.startedMessageId ??= startMessageIdOf(frame);
    this.frames.push(frame);
    this.bytes += size;
    for (const subscriber of [...this.subscribers]) {
      subscriber.onFrame(frame);
    }
    this.onBytes(size);
  }

  /** The turn ended: tell the followers and keep the frames for the grace period. */
  finish(): void {
    this.ended = true;
    if (this.finished || this.dropped) return;
    this.finished = true;
    this.endSubscribers('done');
  }

  /**
   * The buffer will not be completed (it grew too large, or a newer turn replaced it).
   * Followers are told to give up, which the route turns into a closed connection so the
   * client falls back instead of mistaking a half stream for a finished answer.
   */
  drop(): void {
    if (this.dropped) return;
    this.dropped = true;
    this.frames.length = 0;
    const released = this.bytes;
    this.bytes = 0;
    if (released > 0) this.onBytes(-released);
    this.endSubscribers('aborted');
  }

  /**
   * Replays every frame so far, then follows the live ones. Returns `undefined` when there
   * is nothing complete to serve. The returned function stops following.
   */
  subscribe(subscriber: TurnSubscriber): (() => void) | undefined {
    if (this.dropped) return undefined;
    for (const frame of this.frames) subscriber.onFrame(frame);
    if (this.finished) {
      subscriber.onEnd('done');
      return () => undefined;
    }
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Stops the model run (the user pressed stop). Idempotent. */
  cancel(): void {
    this.cancelTurn();
  }

  private endSubscribers(end: TurnEnd): void {
    const followers = [...this.subscribers];
    this.subscribers.clear();
    for (const subscriber of followers) subscriber.onEnd(end);
  }
}

/** One buffer per session: a new turn replaces the previous one of that session. */
export class TurnRegistry {
  private readonly turns = new Map<string, TurnBuffer>();
  /** Bytes of the frames of every buffer, kept as buffers grow and are dropped. */
  private held = 0;

  constructor(
    private readonly options: {
      graceMs: number;
      maxTurns: number;
      maxBytes: number;
      maxTotalBytes?: number;
    } = {
      graceMs: TURN_GRACE_MS,
      maxTurns: MAX_TURNS,
      maxBytes: MAX_TURN_BYTES,
    }
  ) {}

  start(sessionId: string, userId: string, cancel: () => void): TurnBuffer {
    this.turns.get(sessionId)?.drop();
    this.turns.delete(sessionId);
    while (this.turns.size >= this.options.maxTurns && this.evictOne()) {
      // One at a time, until there is room for the new turn.
    }
    const buffer: TurnBuffer = new TurnBuffer(
      sessionId,
      userId,
      cancel,
      this.options.maxBytes,
      (delta) => {
        this.held += delta;
        if (delta > 0) this.enforceByteBudget(buffer);
      }
    );
    this.turns.set(sessionId, buffer);
    return buffer;
  }

  get(sessionId: string): TurnBuffer | undefined {
    return this.turns.get(sessionId);
  }

  /** The turn is over: keep its frames for the grace period, then forget them. */
  release(buffer: TurnBuffer): void {
    buffer.finish();
    const timer = setTimeout(() => {
      if (this.turns.get(buffer.sessionId) === buffer) {
        buffer.drop();
        this.turns.delete(buffer.sessionId);
      }
    }, this.options.graceMs);
    timer.unref();
  }

  size(): number {
    return this.turns.size;
  }

  /** Bytes of the frames held for every session. */
  heldBytes(): number {
    return this.held;
  }

  clear(): void {
    for (const buffer of this.turns.values()) buffer.drop();
    this.turns.clear();
    this.held = 0;
  }

  /**
   * Over the byte budget: forget the oldest finished turns first, running ones last. Runs
   * whenever a buffer grows, so the budget holds while turns are still running, not only at
   * their boundaries. `keep` is the buffer that grew; it is never the one forgotten.
   */
  private enforceByteBudget(keep: TurnBuffer): void {
    const budget = this.options.maxTotalBytes ?? MAX_TOTAL_BYTES;
    while (this.held > budget && this.evictOne(keep)) {
      // One at a time, until the budget holds.
    }
  }

  /**
   * Forgets one turn, never `keep`. A turn that has ended is only kept for a late reconnect,
   * so it goes before any that is still running; a running one still finishes and is stored,
   * it just can no longer be reattached to or stopped from here.
   */
  private evictOne(keep?: TurnBuffer): boolean {
    let victim: TurnBuffer | undefined;
    for (const turn of this.turns.values()) {
      if (turn === keep) continue;
      if (turn.hasEnded) {
        victim = turn;
        break;
      }
      victim ??= turn;
    }
    if (!victim) return false;
    victim.drop();
    this.turns.delete(victim.sessionId);
    return true;
  }
}

export const turnRegistry = new TurnRegistry();
