/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/chat-area.tsx: no header, tabs, feedback,
// annotation queue or flip transition. The transport uses `useFetch`, so the stream URL
// carries the `customView` flag like every other call.

import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Box, ChatMessageList } from '@commercetools/nimbus';
import { useSession } from '../../contexts';
import { useFetch } from '../../hooks/use-fetch';
import type {
  NextPrompt,
  PromptSuggestion,
} from '../../hooks/use-chat-service-connector/types';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { FollowUpChips } from './follow-up-chips';
import { CHAT_COLUMN_WIDTH, CHAT_TRANSCRIPT_WIDTH } from './layout';
import { Message } from './message';
import { TypingIndicator } from './typing-indicator';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

type Props = {
  sessionId: string;
  initialMessages: UIMessage[];
  url: string;
  suggestions?: PromptSuggestion[];
  isLoadingSuggestions: boolean;
  followUps: NextPrompt[];
  onDismissFollowUps: () => void;
  /** Tells `NewChat` a turn just landed, so it can poll for that turn's digest. */
  onTurnFinished: () => void;
};

/** The conversation: transcript and composer. */
const ChatArea = ({
  sessionId,
  initialMessages,
  url,
  suggestions,
  isLoadingSuggestions,
  followUps,
  onDismissFollowUps,
  onTurnFinished,
}: Props) => {
  const { refreshSessions } = useSession();
  const fetchWithFlags = useFetch();

  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList | undefined>(undefined);

  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const isRetryingRef = useRef(false);

  // `useChat` keeps the first transport it sees for an id, so rebuild only when the URL or
  // the flag-aware fetch changes.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: url,
        prepareSendMessagesRequest({ messages: outgoing, id }) {
          return { body: { message: outgoing[outgoing.length - 1], id } };
        },
        // `useFetch` appends `customView` to the stream URL (the URL already carries
        // `?locale=`; the flag is added on top, once) and forwards through the gateway.
        fetch: fetchWithFlags,
      }),
    [url, fetchWithFlags]
  );

  const { messages, sendMessage, regenerate, status, error } = useChat({
    id: sessionId,
    messages: initialMessages,

    onError: () => {
      if (retryCountRef.current >= MAX_RETRIES) {
        setShowErrorBanner(true);
        retryCountRef.current = 0;
      }
    },

    onFinish: ({ finishReason }) => {
      if (finishReason !== 'error') {
        retryCountRef.current = 0;
        onTurnFinished();
        void refreshSessions();
        return;
      }

      if (retryCountRef.current < MAX_RETRIES && !isRetryingRef.current) {
        isRetryingRef.current = true;
        retryCountRef.current += 1;
        setIsRetrying(true);

        setTimeout(() => {
          regenerate();
          isRetryingRef.current = false;
          setIsRetrying(false);
        }, RETRY_DELAY_MS * retryCountRef.current);
      } else if (retryCountRef.current >= MAX_RETRIES) {
        setShowErrorBanner(true);
        retryCountRef.current = 0;
        setIsRetrying(false);
      }
    },

    transport,
  });

  const isEmpty = messages.length === 0;
  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSubmit = useCallback(() => {
    if (input.trim() && status === 'ready') {
      retryCountRef.current = 0;
      setShowErrorBanner(false);
      onDismissFollowUps();
      sendMessage({ text: input, files });
      setInput('');
      setFiles(undefined);
    }
  }, [input, status, sendMessage, files, onDismissFollowUps]);

  const handlePickPrompt = useCallback(
    (prompt: string) => {
      if (status !== 'ready') return;
      setShowErrorBanner(false);
      onDismissFollowUps();
      sendMessage({ text: prompt });
    },
    [status, sendMessage, onDismissFollowUps]
  );

  return (
    <Box
      display="flex"
      flexDirection="column"
      flex="1"
      minHeight="0"
      width="100%"
      paddingX="300"
      justifyContent={isEmpty ? 'center' : undefined}
      overflowY={isEmpty ? 'auto' : undefined}
      paddingTop={isEmpty ? '400' : '0'}
    >
      {(showErrorBanner || error) && !isRetrying && (
        <Alert.Root
          colorPalette="critical"
          variant="outlined"
          maxWidth={CHAT_COLUMN_WIDTH}
          marginX="auto"
          marginY="200"
        >
          <Alert.Description>
            {error?.message ||
              'An error occurred while processing your request. Please try again.'}
          </Alert.Description>
          <Alert.DismissButton onPress={() => setShowErrorBanner(false)} />
        </Alert.Root>
      )}

      {isEmpty ? (
        <EmptyState
          suggestions={suggestions}
          isLoadingSuggestions={isLoadingSuggestions}
          onPickPrompt={handlePickPrompt}
        />
      ) : (
        <ChatMessageList.Root
          aria-label="Conversation with the AI assistant"
          flex="1"
          minHeight="0"
          width="100%"
          maxWidth={CHAT_TRANSCRIPT_WIDTH}
          marginX="auto"
        >
          {messages.map((message, index) => (
            <ChatMessageList.Item key={message.id}>
              <Message
                message={message}
                isLatestAssistant={
                  message.role === 'assistant' && index === messages.length - 1
                }
                isStreaming={
                  status === 'streaming' && index === messages.length - 1
                }
                onRegenerate={regenerate}
              />
            </ChatMessageList.Item>
          ))}
          {status === 'submitted' && (
            <ChatMessageList.Item>
              <TypingIndicator />
            </ChatMessageList.Item>
          )}
          {status === 'ready' && followUps.length > 0 && !input.trim() && (
            <ChatMessageList.Item>
              <FollowUpChips prompts={followUps} onPick={handlePickPrompt} />
            </ChatMessageList.Item>
          )}
        </ChatMessageList.Root>
      )}

      <Box width="100%" flexShrink="0" paddingTop="300" paddingBottom="200">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
          files={files}
          onFilesChange={setFiles}
        />
      </Box>
    </Box>
  );
};

export default ChatArea;
