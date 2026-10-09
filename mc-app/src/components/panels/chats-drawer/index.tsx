/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useMemo, useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Add } from '@commercetools/nimbus-icons';
import {
  Box,
  Button,
  Drawer,
  SearchInput,
  Stack,
  Text,
} from '@commercetools/nimbus';
import type { SessionSummary } from '../../../hooks/use-chat-service-connector/types';
import {
  DAY_GROUP_LABELS,
  DAY_GROUP_ORDER,
  dayGroup,
  type DayGroup,
} from '../../../utils/relative-time';
import { ChatGroup } from './chat-group';
import { DeleteChatDialog } from './delete-chat-dialog';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
};

/**
 * Every conversation in this project, searchable and grouped by day.
 *
 * Search matches the title AND the description, which is the real reason the digest
 * writes one: "the chat where I looked at the beer mug" is how people remember a
 * conversation, and that phrase is far more likely to be in a sentence about it than in a
 * six-word title.
 *
 * Sessions with no `updatedAt` - only possible for a row served by the pre-digest
 * fallback - are grouped under "Older" rather than dropped.
 */
export const ChatsDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  onNewSession,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );
  const [query, setQuery] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<SessionSummary | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? sessions.filter(
          (session) =>
            session.title?.toLowerCase().includes(needle) ||
            session.description?.toLowerCase().includes(needle)
        )
      : sessions;

    const buckets: Record<DayGroup, SessionSummary[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    matching.forEach((session) => {
      const bucket =
        session.updatedAt === undefined ? 'older' : dayGroup(session.updatedAt);
      buckets[bucket].push(session);
    });

    return buckets;
  }, [sessions, query]);

  const handleSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  };

  const handleNewSession = () => {
    onNewSession();
    onClose();
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteSession(sessionToDelete.id);
    } finally {
      setIsDeleting(false);
      setSessionToDelete(null);
    }
  };

  const hasResults = DAY_GROUP_ORDER.some((key) => grouped[key].length > 0);

  return (
    <>
      <Drawer.Root
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        placement="left"
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Your chats</Drawer.Title>
            <Drawer.CloseTrigger />
          </Drawer.Header>

          <Drawer.Body>
            <Stack direction="column" gap="300">
              <SearchInput
                aria-label="Search your chats"
                placeholder="Search your chats"
                value={query}
                onChange={setQuery}
                onClear={() => setQuery('')}
                width="100%"
                size="sm"
              />

              <Button
                variant="solid"
                colorPalette="primary"
                size="sm"
                onPress={handleNewSession}
              >
                <Add />
                New chat
              </Button>

              <Box>
                {!hasResults ? (
                  <Text color="neutral.11" textAlign="center" padding="800">
                    {query.trim()
                      ? `No chats match "${query.trim()}"`
                      : 'No previous chats found'}
                  </Text>
                ) : (
                  DAY_GROUP_ORDER.map((key) => (
                    <ChatGroup
                      key={key}
                      label={DAY_GROUP_LABELS[key]}
                      sessions={grouped[key]}
                      currentSessionId={currentSessionId}
                      locale={dataLocale}
                      onSelect={handleSelect}
                      onRequestDelete={setSessionToDelete}
                    />
                  ))
                )}
              </Box>
            </Stack>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>

      <DeleteChatDialog
        session={sessionToDelete}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSessionToDelete(null)}
      />
    </>
  );
};

export default ChatsDrawer;
