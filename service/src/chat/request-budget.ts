/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export type BudgetPhase = 'normal' | 'wrapping-up' | 'expired';

/**
 * The time budget of one chat turn.
 *
 * ```
 * T0 request start     soft = T0 + budget - reserve        hard = T0 + budget      Connect kills at 300 s
 * |-- history + resolve --|-------- steps (tools abort at soft) --|-- wrap-up step --|-- notice --|
 * ```
 *
 * - `softSignal` aborts at the soft deadline: running tools stop and the loop moves on to the
 *   wrap-up step.
 * - `hardSignal` aborts at the hard deadline OR when the client goes away. It is the single
 *   authority for the agent run; `timedOut()` tells the two causes apart.
 *
 * Time spent before streaming (history read, source resolution) counts, because the budget
 * starts at the request start.
 */
export class RequestBudget {
  readonly softDeadlineAt: number;
  readonly hardDeadlineAt: number;
  readonly softSignal: AbortSignal;
  readonly hardSignal: AbortSignal;

  private readonly softController = new AbortController();
  private readonly hardController = new AbortController();
  private readonly timers: NodeJS.Timeout[] = [];
  private hardFired = false;
  private cancelled = false;

  constructor(
    readonly startedAt: number,
    budgetMs: number,
    reserveMs: number,
    private readonly clientGone: AbortSignal,
    private readonly now: () => number = Date.now
  ) {
    this.hardDeadlineAt = startedAt + budgetMs;
    this.softDeadlineAt = this.hardDeadlineAt - reserveMs;
    this.softSignal = this.softController.signal;
    this.hardSignal = AbortSignal.any([this.hardController.signal, clientGone]);

    const arm = (at: number, fire: () => void) => {
      const timer = setTimeout(fire, Math.max(0, at - this.now()));
      timer.unref();
      this.timers.push(timer);
    };
    arm(this.softDeadlineAt, () => this.softController.abort());
    arm(this.hardDeadlineAt, () => {
      this.hardFired = true;
      this.softController.abort();
      this.hardController.abort();
    });
  }

  /**
   * Stops the run on purpose (the user pressed stop). Like a client disconnect it is silent:
   * `timedOut()` stays false, so no time-limit notice is written.
   */
  cancel(): void {
    // A deadline that is still armed must not turn this stop into a time-limit end later, if
    // the run takes a moment to unwind.
    this.cancelled = true;
    this.dispose();
    this.hardController.abort();
  }

  remainingMs(): number {
    return this.hardDeadlineAt - this.now();
  }

  phase(): BudgetPhase {
    const now = this.now();
    if (now >= this.hardDeadlineAt) return 'expired';
    if (now >= this.softDeadlineAt) return 'wrapping-up';
    return 'normal';
  }

  /** True when the hard deadline (not a client disconnect) ended the run. */
  timedOut(): boolean {
    return this.hardFired && !this.clientGone.aborted && !this.cancelled;
  }

  /** Clears the timers; call once the turn is over so no handle stays open. */
  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;
  }
}
