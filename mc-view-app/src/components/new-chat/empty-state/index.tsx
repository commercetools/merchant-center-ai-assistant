/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/empty-state/index.tsx without the recent
// chats column (the panel has one session per host page and no chats drawer).

import React from 'react';
import { Box } from '@commercetools/nimbus';
import type { PromptSuggestion } from '../../../hooks/use-chat-service-connector/types';
import { CHAT_COLUMN_WIDTH } from '../layout';
import { Greeting } from './greeting';
import { SuggestionCards } from './suggestion-cards';

type Props = {
  suggestions?: PromptSuggestion[];
  isLoadingSuggestions: boolean;
  onPickPrompt: (prompt: string) => void;
};

/** What a session looks like before anything has been said: a greeting and four prompts. */
export const EmptyState: React.FC<Props> = ({
  suggestions,
  isLoadingSuggestions,
  onPickPrompt,
}) => (
  <Box
    width="100%"
    maxWidth={CHAT_COLUMN_WIDTH}
    marginX="auto"
    paddingBottom="400"
  >
    <Greeting />
    <SuggestionCards
      suggestions={suggestions}
      isLoading={isLoadingSuggestions}
      onPick={onPickPrompt}
    />
  </Box>
);

export default EmptyState;
