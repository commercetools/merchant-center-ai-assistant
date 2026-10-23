/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAdminConnector } from '../../hooks/use-admin-connector';
import type { FeedbackRecord } from '../../hooks/admin-types';
import { SERVICE_FILE_PREFIX } from '../../hooks/use-service-image';
import { describeAdminError } from '../../utils/admin-error';
import { FilePartRenderer } from '../new-chat/parts/file-part';
import { UserDisplay } from './user-display';
// The chat's `PartRenderer` is deliberately NOT reused here: it
// gates reasoning and tool parts behind `useToolCallLogsConfigContext()` - the
// reviewing ADMIN'S OWN detail-level setting - so a reviewer with those toggles off
// would see exactly the data this feature exists to capture silently blanked.
// It also routes into `babel-renderer`, which would EXECUTE a user's generated UI
// inside the backoffice.
// Pure function, no context dependency - safe to reuse.
import { extractToolPartProps } from '../new-chat/types';
import type { MessagePart } from '../new-chat/types';
import { ArrowBack } from '@commercetools/nimbus-icons';
import {
  Box,
  Button,
  ChatMessage,
  Grid,
  Heading,
  LoadingSpinner,
  Separator,
  Stack,
  Text,
} from '@commercetools/nimbus';

// ============================================================================
// Local presentational helpers (Nimbus components + Chakra style props)
// ============================================================================

/** The uppercase caption shared by the metadata grid and the part labels. */
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text
    textStyle="2xs"
    fontWeight="600"
    textTransform="uppercase"
    letterSpacing="wider"
    color="neutral.11"
  >
    {children}
  </Text>
);

/**
 * Capped so a single multi-hundred-kB tool output cannot destroy the layout.
 * Colours are set explicitly rather than inherited because this renders inside
 * a `ChatMessage` body, and the `user` variant tints that surface with
 * `colorPalette.2`.
 */
const JsonBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    as="pre"
    width="100%"
    m="0"
    maxHeight="240px"
    overflow="auto"
    whiteSpace="pre-wrap"
    wordBreak="break-word"
    fontFamily="mono"
    textStyle="xs"
    p="200"
    border="solid-25"
    borderColor="neutral.6"
    borderRadius="150"
    bg="neutral.3"
    color="neutral.12"
  >
    {children}
  </Box>
);

/**
 * A labelled part. `ChatMessage.Body` is itself a flex column with a `400` gap,
 * so this only owns the label-to-content spacing - the gap that used to come
 * from the `PartWrapper` adjacent-sibling rule is now the body's own.
 */
const LabelledPart: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <Stack direction="column" gap="100" width="100%">
    <FieldLabel>{label}</FieldLabel>
    {children}
  </Stack>
);

// ============================================================================
// Helpers
// ============================================================================

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const formatTimestamp = (createdAt?: number, createdAtIso?: string): string => {
  if (createdAt) return new Date(createdAt).toLocaleString();
  if (createdAtIso) return new Date(createdAtIso).toLocaleString();
  return '-';
};

const formatBytes = (bytes?: number): string => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * True for `tool-<name>` parts, `dynamic-tool` parts, and anything else that
 * carries a `toolCallId` - the snapshot stores unfiltered client data, so a
 * future/unknown tool part shape must still be recognised as a tool call.
 */
const isToolLikePart = (part: MessagePart): boolean => {
  if (typeof part?.type === 'string') {
    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
      return true;
    }
  }
  return typeof part === 'object' && part !== null && 'toolCallId' in part;
};

const MetaField: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <Box minWidth="0">
    <FieldLabel>{label}</FieldLabel>
    <Text textStyle="sm" color="neutral.12" wordBreak="break-word">
      {value}
    </Text>
  </Box>
);

// ============================================================================
// Part rendering - local and exhaustive, with a catch-all
// ============================================================================

/**
 * Renders one message part. Every known `part.type` gets a case and everything
 * else falls through to a raw JSON dump: a triage view must never silently
 * drop a part, because the dropped one is usually the reason for the report.
 */
const renderPart = (part: MessagePart, key: string): React.ReactNode => {
  switch (part.type) {
    case 'text':
      return (
        <Text key={key} whiteSpace="pre-wrap" wordBreak="break-word">
          {part.text}
        </Text>
      );

    case 'reasoning':
      return (
        <LabelledPart
          key={key}
          label={`Reasoning${part.state ? ` (${part.state})` : ''}`}
        >
          <JsonBlock>{part.text}</JsonBlock>
        </LabelledPart>
      );

    case 'file':
      return (
        <LabelledPart key={key} label="File">
          {/* A service-relative image (`/files/<session>/<file>`) is loaded through the
              gateway by `useServiceImage` (inside FilePartRenderer), never as a plain
              <img src>. Anything else is shown as text only. */}
          {part.url?.startsWith(SERVICE_FILE_PREFIX) &&
          part.mediaType?.startsWith('image/') ? (
            <FilePartRenderer
              mediaType={part.mediaType}
              url={part.url}
              filename={part.filename}
            />
          ) : null}
          <JsonBlock>
            {safeStringify({
              mediaType: part.mediaType,
              filename: part.filename,
              // Shown as text, never embedded: it is user-generated content.
              url: part.url?.startsWith('data:')
                ? `[inline data URL, ${part.url.length} chars]`
                : part.url,
            })}
          </JsonBlock>
        </LabelledPart>
      );

    case 'source-url':
      return (
        <LabelledPart key={key} label="Source (url)">
          <JsonBlock>
            {safeStringify({
              sourceId: part.sourceId,
              title: part.title,
              url: part.url,
            })}
          </JsonBlock>
        </LabelledPart>
      );

    case 'source-document':
      return (
        <LabelledPart key={key} label="Source (document)">
          <JsonBlock>
            {safeStringify({
              sourceId: part.sourceId,
              title: part.title,
              mediaType: part.mediaType,
              filename: part.filename,
            })}
          </JsonBlock>
        </LabelledPart>
      );

    case 'step-start':
      // The old `StepDivider` was a 1px div; Nimbus `Separator` is the same
      // line with the semantic role attached.
      return <Separator key={key} />;

    default:
      break;
  }

  // tool-* / dynamic-tool / anything carrying a toolCallId
  if (isToolLikePart(part)) {
    const toolPart = extractToolPartProps(part);
    if (toolPart) {
      return (
        <LabelledPart
          key={key}
          label={
            <>
              Tool: {toolPart.toolName || toolPart.type || 'unknown'}
              {toolPart.state ? ` (${toolPart.state})` : ''}
              {toolPart.preliminary ? ' (preliminary)' : ''}
            </>
          }
        >
          <JsonBlock>
            {safeStringify({
              type: toolPart.type,
              toolCallId: toolPart.toolCallId,
              toolName: toolPart.toolName,
              state: toolPart.state,
              input: toolPart.input,
              output: toolPart.output,
              errorText: toolPart.errorText,
            })}
          </JsonBlock>
        </LabelledPart>
      );
    }
    // `extractToolPartProps` returns null for a tool part with no `state`
    // field; fall through to the raw dump rather than dropping it.
  }

  // data-*
  if (typeof part?.type === 'string' && part.type.startsWith('data-')) {
    return (
      <LabelledPart key={key} label={part.type}>
        <JsonBlock>{safeStringify(part)}</JsonBlock>
      </LabelledPart>
    );
  }

  // Catch-all: unknown part type.
  return (
    <LabelledPart
      key={key}
      label={`Unknown part${
        typeof part?.type === 'string' ? `: ${part.type}` : ''
      }`}
    >
      <JsonBlock>{safeStringify(part)}</JsonBlock>
    </LabelledPart>
  );
};

// ============================================================================
// Component
// ============================================================================

interface FeedbackDetailProps {
  feedbackId: string;
  /** Returns to the list. Not `history.push` - the list owns the toggle. */
  onBack: () => void;
}

const FeedbackDetail: React.FC<FeedbackDetailProps> = ({
  feedbackId,
  onBack,
}) => {
  const { getFeedbackEntry } = useAdminConnector();

  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Rendered, not swallowed: a 403 `ADMIN_REQUIRED` or a 404 must not look like an empty
  // result.
  const [error, setError] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    if (!feedbackId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await getFeedbackEntry(feedbackId);
      if (response?.success && response.data) {
        setFeedback(response.data);
      } else {
        setFeedback(null);
        setError(
          response?.error ||
            response?.message ||
            'Failed to load this feedback entry.'
        );
      }
    } catch (err) {
      setFeedback(null);
      setError(describeAdminError(err, 'Failed to load this feedback entry.'));
    } finally {
      setIsLoading(false);
    }
  }, [feedbackId, getFeedbackEntry]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const backButton = (
    <Button variant="ghost" colorPalette="primary" onPress={onBack}>
      {<ArrowBack />} Back to feedback
    </Button>
  );

  if (isLoading) {
    return (
      <Stack direction="column" gap="200">
        {backButton}
        <Stack direction="column" gap="600" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack direction="column" gap="200">
        {backButton}
        <Text color="critical.11">Could not load feedback</Text>
        <Text textStyle="sm" color="neutral.11">
          {error}
        </Text>
      </Stack>
    );
  }

  if (!feedback) {
    return (
      <Stack direction="column" gap="200">
        {backButton}
        <Text>Feedback not found.</Text>
      </Stack>
    );
  }

  const messages = feedback.messages ?? [];
  const countMismatch =
    typeof feedback.clientMessageCount === 'number' &&
    typeof feedback.storedMessageCount === 'number' &&
    feedback.clientMessageCount !== feedback.storedMessageCount;

  return (
    <Stack direction="column" gap="400">
      {backButton}

      <Heading as="h2">Feedback</Heading>

      {/* Metadata strip - this is how a reviewer knows whether the transcript
          in front of them is complete. */}
      <Grid
        templateColumns="repeat(auto-fill, minmax(220px, 1fr))"
        rowGap="100"
        columnGap="400"
        p="400"
        border="solid-25"
        borderColor="neutral.6"
        borderRadius="150"
        bg="neutral.3"
      >
        <MetaField
          label="Submitted"
          value={formatTimestamp(feedback.createdAt, feedback.createdAtIso)}
        />
        <MetaField
          label="Submitted by"
          value={
            <UserDisplay
              userId={feedback.userId}
              userLabel={feedback.userLabel}
            />
          }
        />
        <MetaField label="Session ID" value={feedback.sessionId || '-'} />
        <MetaField label="Feedback ID" value={feedback.id} />
        {feedback.sessionTitle && (
          <MetaField label="Session title" value={feedback.sessionTitle} />
        )}
        {feedback.sessionUserId && (
          <MetaField label="Session owner" value={feedback.sessionUserId} />
        )}
        <MetaField
          label="Snapshot source"
          value={
            feedback.snapshotSource === 'server'
              ? 'server (reasoning + most tool calls were already stripped)'
              : feedback.snapshotSource || '-'
          }
        />
        <MetaField
          label="Messages in snapshot"
          value={feedback.messageCount ?? messages.length}
        />
        <MetaField
          label="Client / stored messages"
          value={`${feedback.clientMessageCount ?? '-'} / ${
            feedback.storedMessageCount ?? '-'
          }`}
        />
        <MetaField
          label="Truncated"
          value={feedback.truncated ? 'yes' : 'no'}
        />
        <MetaField
          label="Snapshot size"
          value={formatBytes(feedback.snapshotBytes)}
        />
        {typeof feedback.chunkCount === 'number' && (
          <MetaField label="Snapshot chunks" value={feedback.chunkCount} />
        )}
        {feedback.featureFlags && (
          <MetaField
            label="Feature flags"
            value={safeStringify(feedback.featureFlags)}
          />
        )}
      </Grid>

      {feedback.snapshotSource === 'server' && (
        <Text textStyle="sm" color="warning.11">
          This snapshot came from the stored transcript, not the browser, so
          reasoning parts and non-storable tool calls are missing by
          construction.
        </Text>
      )}

      {feedback.snapshotIntact === false && (
        <Text textStyle="sm" color="warning.11">
          The stored snapshot could not be reassembled completely - the
          transcript below is partial.
        </Text>
      )}

      {countMismatch && (
        <Text textStyle="sm" color="warning.11">
          Client message count ({feedback.clientMessageCount}) differs from the
          stored count ({feedback.storedMessageCount}) - the transcript below
          may be partial.
        </Text>
      )}

      <Stack direction="column" gap="100">
        <Heading as="h4">Comment</Heading>
        <Box
          p="400"
          border="solid-25"
          borderColor="neutral.6"
          borderRadius="150"
          bg="bg"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
          textStyle="sm"
          color="neutral.12"
        >
          {feedback.comment || '(no comment - the whole session was reported)'}
        </Box>
      </Stack>

      {feedback.truncations && feedback.truncations.length > 0 && (
        <Stack direction="column" gap="100">
          <Heading as="h4">Truncations ({feedback.truncations.length})</Heading>
          <JsonBlock>{safeStringify(feedback.truncations)}</JsonBlock>
        </Stack>
      )}

      <Stack direction="column" gap="100">
        <Heading as="h4">Conversation ({messages.length})</Heading>

        {messages.length === 0 ? (
          <Text color="neutral.11">
            This feedback carries no snapshot messages.
          </Text>
        ) : (
          /* A plain Stack, not `ChatMessageList.Root`: that owns a ScrollArea
             and stick-to-bottom autoscroll, which would nest a second scroller
             inside the detail page and jump an opened report to its end. */
          <Stack direction="column" gap="400" mt="200">
            {messages.map((message, messageIndex) => {
              const isUser = message.role === 'user';
              return (
                <ChatMessage.Root
                  key={message.id || `message-${messageIndex}`}
                  sender={isUser ? 'user' : 'agent'}
                >
                  <ChatMessage.Body>
                    {(message.parts ?? []).map((part, partIndex) =>
                      renderPart(part, `part-${messageIndex}-${partIndex}`)
                    )}
                  </ChatMessage.Body>
                  {/* The live chat drops the role caption because `sender`
                      conveys it, but a stored snapshot can hold roles Nimbus
                      has no sender for (`system`, `tool`) - those all render as
                      `agent`, so the literal role stays visible here. */}
                  <ChatMessage.Meta>
                    <FieldLabel>{message.role}</FieldLabel>
                  </ChatMessage.Meta>
                </ChatMessage.Root>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default FeedbackDetail;
