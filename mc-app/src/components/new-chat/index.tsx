/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { ComposePreviewProvider } from '../../contexts/compose-preview-context';
import { useSession } from '../../contexts/session';
import { useChatConnector } from '../../hooks/use-chat-service-connector/use-chat-connector';
import { useChatServiceEndpoint } from '../../hooks/use-chat-service-endpoint';
import { useNextPrompts } from '../../hooks/use-next-prompts';
import { useSuggestions } from '../../hooks/use-suggestions';
import InteractiveTabContent from '../interactive-tab-content';
import ManageMcpPanel from '../managed-mcp/manage-mcp-panel';
import { ChatsDrawer } from '../panels/chats-drawer';
import ComposedPagesPanel from '../panels/composed-page-panel';
import { SettingsDrawer } from '../panels/settings-drawer';
import { AppRail, type DrawerId } from '../shell/app-rail';
import type { TabId } from '../shell/view-tabs';

/**
 * The chat shell: the rail on the left, one session on the right.
 *
 * The four drawers are mutually exclusive, so they are one piece of state rather than the
 * four independent booleans they used to be - which allowed two to be open at once, each
 * covering the other.
 */
const NewChat: React.FC = () => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  const [activeTab, setActiveTab] = useState<TabId>('assistant');
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);

  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );

  const {
    sessionId,
    messages,
    createNewSession,
    setCurrentSession,
    isLoading,
  } = useChatConnector();
  const {
    allSessions,
    deleteSessionById,
    isLoading: isLoadingSessions,
  } = useSession();

  /*
   * Both of these are fetched HERE rather than by the components that display them, and
   * that placement is the whole point.
   *
   * `EmptyState` and `ChatArea` only mount once `isReady` flips, so asking from inside
   * them put two more round trips AFTER everything else had finished - a fourth wave, on
   * its own, at the end of the load. Neither actually depends on anything in that wave:
   * suggestions need a user and a locale, follow-ups need a session id, and all three are
   * known as soon as this component mounts. Asking from here overlaps them with the
   * session and message reads instead of queueing behind them.
   *
   * The cost is one suggestions request for a conversation that turns out not to be
   * empty. It is a parallel request the user never waits on, and the service caches per
   * user per day, so it is the cheaper side of the trade.
   */
  const { suggestions, isLoading: isLoadingSuggestions } = useSuggestions(true);

  // When the last turn finished, so the follow-up poll knows what to ask for. Lifted out
  // of `ChatArea` with the hook above; `ChatArea` reports back through `onTurnFinished`.
  const [turnFinishedAt, setTurnFinishedAt] = useState<number | null>(null);
  const handleTurnFinished = useCallback(
    // `since` is given when the end of the turn was noticed late (see the recovery).
    (since?: number) => setTurnFinishedAt(since ?? Date.now()),
    []
  );
  const { prompts: followUps, dismiss: dismissFollowUps } = useNextPrompts(
    sessionId,
    turnFinishedAt
  );

  const toggleDrawer = useCallback((drawer: DrawerId) => {
    setOpenDrawer((current) => (current === drawer ? null : drawer));
  }, []);

  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  const handleSelectSession = useCallback(
    (selectedSessionId: string) => setCurrentSession(selectedSessionId),
    [setCurrentSession]
  );

  const url = useMemo(() => {
    const params = new URLSearchParams({ locale: dataLocale });
    return `${chatServiceEndpointUrl}ai-chat/${sessionId}/message/stream?${params.toString()}`;
  }, [chatServiceEndpointUrl, sessionId, dataLocale]);

  useEffect(() => {
    setActiveTab('assistant');
  }, [sessionId]);

  /*
   * Deliberately NOT gated on the session's tool catalogue.
   *
   * `isLoadingTools` used to be in here, which held the entire content column blank on a
   * 169 KB payload that the transcript, the composer and the empty state do not read -
   * only the tools panel does, plus two counters that are happy to arrive late. `messages`
   * is a real dependency: `useChat` takes it as its initial state and will not pick up a
   * later change, so the conversation genuinely cannot mount before it.
   */
  const isReady = !isLoading && !isLoadingSessions;

  return (
    <ComposePreviewProvider sessionId={sessionId}>
      <Box
        display="flex"
        flexDirection="row"
        height="100%"
        width="100%"
        minHeight="0"
        backgroundColor="neutral.2"
      >
        <AppRail
          openDrawer={openDrawer}
          onToggleDrawer={toggleDrawer}
          onNewChat={createNewSession}
        />

        <Box
          flex="1"
          minWidth="0"
          minHeight="0"
          display="flex"
          flexDirection="column"
        >
          {messages && sessionId && isReady && (
            <InteractiveTabContent
              activeTab={activeTab}
              onTabChange={setActiveTab}
              sessionId={sessionId}
              initialMessages={messages}
              url={url}
              onNewSession={createNewSession}
              onOpenChatsDrawer={() => setOpenDrawer('chats')}
              suggestions={suggestions}
              isLoadingSuggestions={isLoadingSuggestions}
              followUps={followUps}
              onDismissFollowUps={dismissFollowUps}
              onTurnFinished={handleTurnFinished}
            />
          )}
        </Box>
      </Box>

      <ChatsDrawer
        isOpen={openDrawer === 'chats'}
        onClose={closeDrawer}
        onNewSession={createNewSession}
        sessions={allSessions}
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={deleteSessionById}
      />

      <SettingsDrawer isOpen={openDrawer === 'config'} onClose={closeDrawer} />
      <ManageMcpPanel isOpen={openDrawer === 'mcp'} onClose={closeDrawer} />

      <ComposedPagesPanel
        isOpen={openDrawer === 'pages'}
        onClose={closeDrawer}
      />
    </ComposePreviewProvider>
  );
};

export default NewChat;
