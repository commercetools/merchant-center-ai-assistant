/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/index.tsx: one session of the host page, no
// rail, drawers or composed pages.

import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Flex } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useAuth } from '../../contexts/auth';
import { useChatConnector } from '../../hooks/use-chat-service-connector/use-chat-connector';
import { useChatServiceEndpoint } from '../../hooks/use-chat-service-endpoint';
import { useNextPrompts } from '../../hooks/use-next-prompts';
import { useSuggestions } from '../../hooks/use-suggestions';
import YourUserId from '../your-user-id';
import ChatArea from './chat-area';

const NewChat: React.FC = () => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  const { userId } = useAuth();
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );

  const { sessionId, messages, createNewSession, isLoading } =
    useChatConnector();

  // Fetched here rather than inside the empty state so they overlap with the session read.
  const { suggestions, isLoading: isLoadingSuggestions } = useSuggestions(true);

  const [turnFinishedAt, setTurnFinishedAt] = useState<number | null>(null);
  const handleTurnFinished = useCallback(
    () => setTurnFinishedAt(Date.now()),
    []
  );
  const { prompts: followUps, dismiss: dismissFollowUps } = useNextPrompts(
    sessionId,
    turnFinishedAt
  );

  // The only query parameter on the stream URL: `useFetch` adds `customView` on top.
  const url = useMemo(() => {
    const params = new URLSearchParams({ locale: dataLocale });
    return `${chatServiceEndpointUrl}ai-chat/${sessionId}/message/stream?${params.toString()}`;
  }, [chatServiceEndpointUrl, sessionId, dataLocale]);

  const isReady = !isLoading;

  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%"
      width="100%"
      minHeight="0"
      backgroundColor="neutral.2"
    >
      <Flex justifyContent="flex-end" paddingX="300" paddingTop="200">
        <Button size="xs" variant="ghost" onPress={createNewSession}>
          New chat
        </Button>
      </Flex>

      {messages && sessionId && isReady && (
        <ChatArea
          // A different session is a different `useChat` instance.
          key={sessionId}
          sessionId={sessionId}
          initialMessages={messages}
          url={url}
          suggestions={suggestions}
          isLoadingSuggestions={isLoadingSuggestions}
          followUps={followUps}
          onDismissFollowUps={dismissFollowUps}
          onTurnFinished={handleTurnFinished}
        />
      )}

      {userId && (
        <Box paddingX="300" paddingBottom="200" flexShrink="0">
          <YourUserId variant="footer" />
        </Box>
      )}
    </Box>
  );
};

export default NewChat;
