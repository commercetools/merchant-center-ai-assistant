/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Waiting for Agentation's shadow root to exist.
 *
 * Its UI is portalled into a `[data-agentation-portal]` wrapper appended to `document.body`
 * from a layout effect of its own, and there is no ordering guarantee against ours - so
 * anything that needs to reach inside has to watch for it rather than look once.
 *
 * Shared by the two hooks that do: `use-agentation-theme` and `use-feedback-mode-sync`.
 */

const HOST = 'agentation-toolbar';

/**
 * Calls `onReady` with the open shadow root, now or as soon as it appears. Returns a
 * teardown that stops the watch; it does not undo anything `onReady` did.
 */
export const whenAgentationReady = (
  onReady: (shadow: ShadowRoot) => void
): (() => void) => {
  const find = () => document.querySelector(HOST)?.shadowRoot ?? null;

  const immediate = find();
  if (immediate) {
    onReady(immediate);
    return () => {};
  }

  const observer = new MutationObserver(() => {
    const shadow = find();
    if (shadow) {
      observer.disconnect();
      onReady(shadow);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
};
