/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { UIMessage } from '@ai-sdk/react';
import { Suspense } from 'react';
import { Box, LoadingSpinner } from '@commercetools/nimbus';
import CodePreview from '../code-preview';
import ComposePreview from '../compose-preview';
import ChatArea from '../new-chat/chat-area';
import type {
  NextPrompt,
  PromptSuggestion,
} from '../../hooks/use-chat-service-connector/types';
import type { TabId } from '../shell/view-tabs';

type Props = {
  sessionId: string;
  initialMessages: UIMessage[];
  url: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onNewSession: () => void;
  onOpenChatsDrawer: () => void;
  /*
   * Passed through rather than fetched below. Both are read by components this one
   * renders, but they are requested by `NewChat`, which mounts well before this does -
   * see the note there on why that ordering matters.
   */
  suggestions?: PromptSuggestion[];
  isLoadingSuggestions: boolean;
  followUps: NextPrompt[];
  onDismissFollowUps: () => void;
  onTurnFinished: () => void;
};

/**
 * Hosts the three views of a session.
 *
 * `ChatArea` is always rendered and never keyed on `sessionId`. Unmounting it would tear
 * down the `useChat` stream, so an answer still being generated when the user peeks at
 * Preview or Code would be lost - it hides its own body instead, and keeps the
 * conversation header on screen so there is always a way back.
 *
 * A `Tabs` migration is not local to this file either: the switcher lives in the
 * conversation header, which `ChatArea` renders, and a `Tabs.Root` would have to span both.
 */
const InteractiveTabContent = ({
  sessionId,
  initialMessages,
  url,
  activeTab,
  onTabChange,
  onNewSession,
  onOpenChatsDrawer,
  suggestions,
  isLoadingSuggestions,
  followUps,
  onDismissFollowUps,
  onTurnFinished,
}: Props) => (
  <Box
    position="relative"
    height="100%"
    width="100%"
    display="flex"
    flexDirection="column"
    minHeight="0"
    overflow="hidden"
  >
    <ChatArea
      sessionId={sessionId}
      initialMessages={initialMessages}
      url={url}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onNewSession={onNewSession}
      onOpenChatsDrawer={onOpenChatsDrawer}
      suggestions={suggestions}
      isLoadingSuggestions={isLoadingSuggestions}
      followUps={followUps}
      onDismissFollowUps={onDismissFollowUps}
      onTurnFinished={onTurnFinished}
    />

    {/*
     * Both previews are lazy (see their `index.ts`). Suspense sits INSIDE the
     * `activeTab !== 'assistant'` check so the chunk request only starts when a tab that
     * needs it is selected, and so the fallback never covers the conversation.
     */}
    {activeTab !== 'assistant' && (
      <Box flex="1" minHeight="0" overflowY="auto">
        <Suspense
          fallback={
            <Box display="flex" justifyContent="center" padding="800">
              <LoadingSpinner size="lg" />
            </Box>
          }
        >
          {activeTab === 'preview' && (
            <ComposePreview onTabChange={onTabChange} />
          )}
          {activeTab === 'code' && <CodePreview />}
        </Suspense>
      </Box>
    )}
  </Box>
);

export default InteractiveTabContent;
