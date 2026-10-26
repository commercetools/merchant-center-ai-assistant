/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { RequestBudget } from '../../src/chat/request-budget';

const make = (opts: { startedAgoMs?: number } = {}) => {
  const clientGone = new AbortController();
  const budget = new RequestBudget(
    Date.now() - (opts.startedAgoMs ?? 0),
    270_000,
    30_000,
    clientGone.signal
  );
  return { budget, clientGone };
};

describe('RequestBudget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancel aborts the run and stays silent: no time-limit end, not even later', () => {
    const { budget } = make();
    jest.advanceTimersByTime(269_000);
    expect(budget.hardSignal.aborted).toBe(false);

    budget.cancel();
    expect(budget.hardSignal.aborted).toBe(true);
    expect(budget.timedOut()).toBe(false);

    // The run takes a moment to unwind and the deadline passes meanwhile: still a stop.
    jest.advanceTimersByTime(5_000);
    expect(budget.timedOut()).toBe(false);
  });

  it('moves through the phases at 0, 245 and 270 seconds', () => {
    const { budget } = make();
    expect(budget.phase()).toBe('normal');
    expect(budget.remainingMs()).toBe(270_000);
    jest.advanceTimersByTime(245_000);
    expect(budget.phase()).toBe('wrapping-up');
    expect(budget.softSignal.aborted).toBe(true);
    expect(budget.hardSignal.aborted).toBe(false);
    jest.advanceTimersByTime(25_000);
    expect(budget.phase()).toBe('expired');
    expect(budget.hardSignal.aborted).toBe(true);
    expect(budget.timedOut()).toBe(true);
    budget.dispose();
  });

  it('aborts the soft signal at 240 seconds and not before', () => {
    const { budget } = make();
    jest.advanceTimersByTime(239_999);
    expect(budget.softSignal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(budget.softSignal.aborted).toBe(true);
    budget.dispose();
  });

  it('counts the time spent before streaming', () => {
    const { budget } = make({ startedAgoMs: 15_000 });
    expect(budget.remainingMs()).toBeLessThanOrEqual(255_000);
    jest.advanceTimersByTime(225_000);
    expect(budget.softSignal.aborted).toBe(true);
    budget.dispose();
  });

  it('a client abort aborts the hard signal but is not a time-out', () => {
    const { budget, clientGone } = make();
    jest.advanceTimersByTime(10_000);
    clientGone.abort();
    expect(budget.hardSignal.aborted).toBe(true);
    expect(budget.softSignal.aborted).toBe(false);
    jest.advanceTimersByTime(300_000);
    expect(budget.timedOut()).toBe(false);
    budget.dispose();
  });

  it('dispose clears the timers so nothing fires afterwards', () => {
    const { budget } = make();
    expect(jest.getTimerCount()).toBe(2);
    budget.dispose();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(300_000);
    expect(budget.softSignal.aborted).toBe(false);
    expect(budget.timedOut()).toBe(false);
  });

  it('exposes the deadlines', () => {
    const { budget } = make();
    expect(budget.hardDeadlineAt - budget.softDeadlineAt).toBe(30_000);
    budget.dispose();
  });
});
