/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Alert, Box, ChatMessageList } from '@commercetools/nimbus';
import { useSession } from '../../contexts';
import { useChatServiceConnector } from '../../hooks/use-chat-service-connector/use-chat-service-connector';
import { useCurrentUser } from '../../hooks/use-current-user';
import type {
  NextPrompt,
  PromptSuggestion,
} from '../../hooks/use-chat-service-connector/types';
import { useFlipTransition } from '../../motion';
import { buildFeedbackSnapshot } from '../../utils/feedback-payload';
import { forwardToFetch } from '../../utils/forward-to';
import { ConversationHeader } from '../shell/conversation-header';
import type { TabId } from '../shell/view-tabs';
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
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onNewSession: () => void;
  onOpenChatsDrawer: () => void;
  /** Opening prompts for the empty state. Fetched by `NewChat` - see the note there. */
  suggestions?: PromptSuggestion[];
  isLoadingSuggestions: boolean;
  /** Follow-up chips for the last reply. Also fetched by `NewChat`. */
  followUps: NextPrompt[];
  onDismissFollowUps: () => void;
  /** Tells `NewChat` a turn just landed, so it can poll for that turn's digest. */
  onTurnFinished: () => void;
};

/**
 * The conversation: header, transcript and composer.
 *
 * The layout has two states and ONE composer. While the session is empty the column is
 * centred, so the greeting, the suggestion cards and the composer sit together in the
 * middle of the screen; once a message exists the transcript takes the space above and the
 * composer settles at the bottom. The composer element occupies the same position in the
 * JSX either way, which is what makes that a move rather than a swap: React keeps the node,
 * so the caret, any typed text and any staged files survive, and `useFlipTransition` has a
 * stable element to glide from the old position to the new one.
 *
 * The component stays mounted when another view is selected - only its body is hidden -
 * because unmounting it would tear down `useChat` and lose an answer that is mid-stream.
 */
const ChatArea = ({
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
}: Props) => {
  const { submitFeedback } = useChatServiceConnector();
  const {
    pendingPrompt,
    clearPendingPrompt,
    allSessions,
    setCurrentSession,
    refreshSessions,
  } = useSession();
  // Display-only and unverified; sent in the feedback body so the backoffice can show who
  // wrote it. The service identifies the caller from the gateway token, not from this.
  const { email } = useCurrentUser();
  const userLabel = email && email !== 'anonymous' ? email : undefined;
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );

  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList | undefined>(undefined);

  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const isRetryingRef = useRef(false);

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
        // The service digests the turn after the stream closes: it renames the session and
        // works out what to offer next. Record when that happened so the follow-up poll
        // can ask for a digest newer than this moment, and re-read the session list so
        // the rail count and recent order catch up. Neither is awaited.
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

    transport: new DefaultChatTransport({
      api: url,
      prepareSendMessagesRequest({ messages: outgoing, id }) {
        return { body: { message: outgoing[outgoing.length - 1], id } };
      },
      // No `headers`: the request goes through the Merchant Center gateway, which builds
      // them. The transport's own Content-Type becomes the outer header inside
      // forwardToFetch, so it is never duplicated on the router hop. A 401 no longer means
      // "router token expired" - a lapsed MC session is renewed inside forwardToFetch, and
      // a persisting one surfaces through onError like any other failure.
      fetch: forwardToFetch,
    }),
  });

  // Assigned DURING render, deliberately: `useChat`'s `messages` is a new array reference
  // on every streamed token, so it can never be a prop or a dep here (it would re-render
  // the header and its open popup dozens of times a second). A `useEffect` sync would lag
  // by a commit, and a feedback submit racing the last token would snapshot stale state.
  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  const isEmpty = messages.length === 0;
  const isLoading = status === 'submitted' || status === 'streaming';

  // The composer's two homes. See the note at the top of this file.
  const composerRef = useRef<HTMLDivElement>(null);
  useFlipTransition(composerRef, isEmpty, {
    enabled: activeTab === 'assistant',
  });

  const handleSubmitFeedback = useCallback(
    async (comment: string) => {
      const response = await submitFeedback({
        sessionId,
        comment: comment || undefined,
        messages: buildFeedbackSnapshot(messagesRef.current),
        userLabel,
      });
      // MUST throw: the popup stays open (with the typed comment) precisely because this
      // promise rejects.
      if (!response?.success) {
        throw new Error(response?.error ?? 'Failed to submit feedback');
      }
    },
    [submitFeedback, userLabel, sessionId]
  );

  /**
   * A thumb IS the feedback, submitted on the spot with the emoji as the comment.
   *
   * It opened the comment popup pre-filled before, which made rating a two-step
   * commitment for what should be a single tap - most people abandoned at the form, and
   * the signal was lost. The transcript goes with it either way (the snapshot is the
   * payload, the comment is optional), so a bare emoji is still a complete report.
   */
  const handleRate = useCallback(
    async (sentiment: 'up' | 'down') => {
      const response = await submitFeedback({
        sessionId,
        comment: sentiment === 'up' ? '\u{1F44D}' : '\u{1F44E}',
        messages: buildFeedbackSnapshot(messagesRef.current),
        userLabel,
      });
      // MUST throw: the button only shows as rated once this resolves.
      if (!response?.success) {
        throw new Error(response?.error ?? 'Failed to submit feedback');
      }
    },
    [submitFeedback, userLabel, sessionId]
  );

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

  /**
   * Prompts handed to the conversation from outside it - see `queuePrompt` in
   * `contexts/session`.
   *
   * Two destinations. `autoSend` goes down the wire as its own turn, which is what Send on
   * the annotation toolbar means; anything else lands in the composer for the user to read
   * first. The auto-send branch waits for `ready` rather than dropping the prompt, because
   * the queue can easily arrive while the previous answer is still streaming - the effect
   * re-runs when `status` settles and sends then.
   */
  useEffect(() => {
    if (!pendingPrompt) {
      return;
    }

    if (!pendingPrompt.autoSend) {
      setInput(pendingPrompt.text);
      clearPendingPrompt();
      return;
    }

    if (status !== 'ready') {
      return;
    }

    retryCountRef.current = 0;
    setShowErrorBanner(false);
    onDismissFollowUps();
    /*
     * The `{ parts }` form rather than `{ text }` when something rides along: the two are
     * mutually exclusive overloads of `sendMessage`, so a message with both a text part and
     * a data part has to be assembled here.
     */
    sendMessage(
      pendingPrompt.parts?.length
        ? {
            parts: [
              { type: 'text' as const, text: pendingPrompt.text },
              ...pendingPrompt.parts,
            ],
          }
        : { text: pendingPrompt.text }
    );
    clearPendingPrompt();
  }, [
    pendingPrompt,
    clearPendingPrompt,
    status,
    sendMessage,
    onDismissFollowUps,
  ]);

  return (
    <>
      {!isEmpty && (
        <ConversationHeader
          sessionId={sessionId}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onNewChat={onNewSession}
          onSubmitFeedback={handleSubmitFeedback}
        />
      )}

      <Box
        // Hidden rather than unmounted while another view is on screen: see the note at
        // the top of this file.
        display={activeTab === 'assistant' ? 'flex' : 'none'}
        flexDirection="column"
        flex="1"
        minHeight="0"
        width="100%"
        paddingX="600"
        // Empty: one centred block. In conversation: transcript fills, composer sinks.
        justifyContent={isEmpty ? 'center' : undefined}
        overflowY={isEmpty ? 'auto' : undefined}
        paddingTop={isEmpty ? '800' : '0'}
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
            sessions={allSessions}
            currentSessionId={sessionId}
            locale={dataLocale}
            suggestions={suggestions}
            isLoadingSuggestions={isLoadingSuggestions}
            onPickPrompt={handlePickPrompt}
            onOpenSession={setCurrentSession}
            onSeeAllChats={onOpenChatsDrawer}
          />
        ) : (
          /*
           * `ChatMessageList.Root` wraps Nimbus ScrollArea and owns autoscroll /
           * stick-to-bottom, the jump-to-latest control, and the single role="log"
           * aria-live="polite" region for the conversation. Unlike a hand-rolled
           * scrollIntoView effect it releases the pin when the user scrolls up to read
           * history instead of yanking them back down on every token.
           */
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
                    message.role === 'assistant' &&
                    index === messages.length - 1
                  }
                  isStreaming={
                    status === 'streaming' && index === messages.length - 1
                  }
                  onRegenerate={regenerate}
                  onRate={handleRate}
                />
              </ChatMessageList.Item>
            ))}
            {/*
             * Only while the request is in flight with no reply yet. Once the assistant
             * message exists, its own thinking pill takes over - so the answer appears
             * where the indicator was rather than the transcript shifting as one is
             * swapped for the other.
             */}
            {status === 'submitted' && (
              <ChatMessageList.Item>
                <TypingIndicator />
              </ChatMessageList.Item>
            )}
            {/*
             * Hidden the moment the user starts typing: they have decided what to ask,
             * and three alternatives under the box is now noise competing with it.
             */}
            {status === 'ready' && followUps.length > 0 && !input.trim() && (
              <ChatMessageList.Item>
                <FollowUpChips prompts={followUps} onPick={handlePickPrompt} />
              </ChatMessageList.Item>
            )}
          </ChatMessageList.Root>
        )}

        {/*
         * The composer's single position in the tree. Everything above it changes; this
         * does not, which is what lets it glide rather than jump when the first message
         * turns the empty state into a conversation.
         */}
        <Box
          ref={composerRef}
          width="100%"
          flexShrink="0"
          paddingTop="400"
          paddingBottom={isEmpty ? '0' : '500'}
        >
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
    </>
  );
};

export default ChatArea;
