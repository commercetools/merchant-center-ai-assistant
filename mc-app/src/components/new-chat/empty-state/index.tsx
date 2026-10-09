/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box, Grid } from '@commercetools/nimbus';
import type {
  PromptSuggestion,
  SessionSummary,
} from '../../../hooks/use-chat-service-connector/types';
import { EMPTY_STATE_WIDTH } from '../layout';
import { Greeting } from './greeting';
import { RecentChats } from './recent-chats';
import { SuggestionCards } from './suggestion-cards';

type Props = {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  locale: string;
  suggestions?: PromptSuggestion[];
  isLoadingSuggestions: boolean;
  onPickPrompt: (prompt: string) => void;
  onOpenSession: (sessionId: string) => void;
  onSeeAllChats: () => void;
};

/**
 * What a session looks like before anything has been said: a greeting, four things worth
 * asking, and the conversations worth returning to.
 *
 * This block and the composer are stacked in a column that is centred in the viewport, so
 * the whole group sits in the middle of the screen rather than the composer being pinned
 * to the bottom under an expanse of nothing. On the first send the block leaves and the
 * composer glides down - see `chat-area.tsx`, which owns that transition.
 *
 * Wider than the conversation (1040px against 860px) because it carries two columns; the
 * composer keeps the conversation's width in both states so it does not visibly resize as
 * it moves.
 *
 * The suggestions arrive as props. They used to be fetched on this component's mount,
 * which read well - "this component only exists while the session is empty, so its mount
 * IS the moment they are needed" - but that mount happens only after the session and its
 * messages have loaded, so the request went out last and the cards spent a second as
 * skeletons. `NewChat` asks for them as soon as it mounts instead.
 */
export const EmptyState: React.FC<Props> = ({
  sessions,
  currentSessionId,
  locale,
  suggestions,
  isLoadingSuggestions,
  onPickPrompt,
  onOpenSession,
  onSeeAllChats,
}) => {
  return (
    <Box
      width="100%"
      maxWidth={EMPTY_STATE_WIDTH}
      marginX="auto"
      paddingBottom="600"
    >
      <Greeting />

      <Grid
        gridTemplateColumns={{
          base: '1fr',
          lg: 'minmax(0, 1.55fr) minmax(0, 1fr)',
        }}
        gap="700"
        alignItems="start"
      >
        <SuggestionCards
          suggestions={suggestions}
          isLoading={isLoadingSuggestions}
          onPick={onPickPrompt}
        />
        <RecentChats
          sessions={sessions}
          currentSessionId={currentSessionId}
          locale={locale}
          onOpenSession={onOpenSession}
          onSeeAll={onSeeAllChats}
        />
      </Grid>
    </Box>
  );
};

export default EmptyState;
