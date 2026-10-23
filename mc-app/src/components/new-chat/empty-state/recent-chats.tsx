/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box, Button, Flex, Stack } from '@commercetools/nimbus';
import type { SessionSummary } from '../../../hooks/use-chat-service-connector/types';
import { useMotion } from '../../../motion';
import { RecentChatRow } from './recent-chat-row';
import { SectionLabel } from './section-label';

const MAX_ROWS = 4;

type Props = {
  sessions: SessionSummary[];
  /** Excluded from the list - it is the empty session the user is looking at. */
  currentSessionId: string | null;
  locale: string;
  onOpenSession: (sessionId: string) => void;
  onSeeAll: () => void;
};

/**
 * "Pick up where you left off": the four most recent conversations.
 *
 * The session list arrives newest-first, so this takes the top of it rather than sorting
 * again. The current session is filtered out - it is the empty one being looked at, and
 * offering to resume it is nonsense.
 *
 * Renders nothing at all when there is no history. A first-time user should see the
 * suggestions filling the width, not an empty panel explaining that they have no chats.
 */
export const RecentChats: React.FC<Props> = ({
  sessions,
  currentSessionId,
  locale,
  onOpenSession,
  onSeeAll,
}) => {
  const motion = useMotion();
  const recent = sessions
    .filter((session) => session.id !== currentSessionId)
    .slice(0, MAX_ROWS);

  if (recent.length === 0) return null;

  return (
    <Stack direction="column" gap="300" {...motion.enter({ delay: 240 })}>
      <Flex alignItems="baseline" justifyContent="space-between">
        <SectionLabel>Pick up where you left off</SectionLabel>
        <Button variant="link" size="xs" onPress={onSeeAll}>
          See all
        </Button>
      </Flex>

      <Box
        backgroundColor="bg"
        borderWidth="25"
        borderStyle="solid"
        borderColor="neutral.6"
        borderRadius="300"
        overflow="hidden"
      >
        {recent.map((session, index) => (
          <RecentChatRow
            key={session.id}
            title={session.title || 'Untitled chat'}
            icon={session.icon}
            updatedAt={session.updatedAt}
            locale={locale}
            isLast={index === recent.length - 1}
            onOpen={() => onOpenSession(session.id)}
          />
        ))}
      </Box>
    </Stack>
  );
};
