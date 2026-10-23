/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The three views of a session: the conversation itself, and - once the assistant has built
 * a composed page - a preview of it and its source.
 *
 * The type lives here rather than in the switcher that renders it because three unrelated
 * places need it: the switcher in the conversation header, the panel host that decides what
 * to show, and the chat shell that owns the state.
 */
export type TabId = 'assistant' | 'preview' | 'code';

export const VIEW_TABS: { id: TabId; label: string }[] = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'preview', label: 'Preview' },
  { id: 'code', label: 'Code' },
];
