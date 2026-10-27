/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Stack, Text } from '@commercetools/nimbus';
import type { SessionSummary } from '../../../hooks/use-chat-service-connector/types';
import { ChatRow } from './chat-row';

type Props = {
  label: string;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  locale: string;
  onSelect: (sessionId: string) => void;
  onRequestDelete: (session: SessionSummary) => void;
};

/**
 * One dated section of the chat list: "Today", "Yesterday", and so on.
 *
 * Grouping by day rather than showing one flat list because the list is ordered by
 * recency and nothing else - without the headings, a user scanning for "the one I did
 * last Tuesday" has to read every row's timestamp.
 */
export const ChatGroup: React.FC<Props> = ({
  label,
  sessions,
  currentSessionId,
  locale,
  onSelect,
  onRequestDelete,
}) => {
  if (sessions.length === 0) return null;

  return (
    <Stack direction="column" gap="50" marginBottom="400">
      <Text
        display="block"
        fontSize="300"
        fontWeight="600"
        letterSpacing="0.05em"
        textTransform="uppercase"
        color="neutral.11"
        marginBottom="100"
      >
        {label}
      </Text>
      {sessions.map((session) => (
        <ChatRow
          key={session.id}
          session={session}
          isActive={session.id === currentSessionId}
          locale={locale}
          onOpen={() => onSelect(session.id)}
          onRequestDelete={() => onRequestDelete(session)}
        />
      ))}
    </Stack>
  );
};
