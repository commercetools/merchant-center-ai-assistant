/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// ============================================================================
// The chat column
// ============================================================================
//
// The composer, the transcript and the error banner are one column: they share a
// measure and are centred in whatever width the tab content gives them. They read
// from these constants rather than each repeating `900px`, which is how the
// transcript came to span the full window while the composer stayed at 900px -
// user messages, being right-aligned, ended up nowhere near the input they came
// from.

const COLUMN_WIDTH_PX = 860;

/**
 * `ChatMessageList`'s `viewport` slot carries `px="400"` (16px a side) and the
 * component exposes no prop that reaches that slot - `Root` forwards style props
 * to the root slot only. So the list's own box has to be 32px wider than the
 * column for the messages *inside* it to line up with the composer's edges
 * instead of sitting 16px inboard of them.
 */
const LIST_VIEWPORT_INSET_PX = 16;

/** The composer, the error banner, the floating action row. */
export const CHAT_COLUMN_WIDTH = `${COLUMN_WIDTH_PX}px`;

/** `ChatMessageList.Root` only - see `LIST_VIEWPORT_INSET_PX`. */
export const CHAT_TRANSCRIPT_WIDTH = `${
  COLUMN_WIDTH_PX + LIST_VIEWPORT_INSET_PX * 2
}px`;

/**
 * The empty state's own measure. Wider than the chat column because it carries two columns
 * side by side - the suggestion cards and the recent-chats list - above the composer, which
 * stays at `CHAT_COLUMN_WIDTH` so it does not change width when it moves to the bottom.
 */
export const EMPTY_STATE_WIDTH = '1040px';
