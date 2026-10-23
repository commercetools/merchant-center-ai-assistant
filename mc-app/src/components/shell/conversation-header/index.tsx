/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useEffect, useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { AutoAwesome } from '@commercetools/nimbus-icons';
import { Box, Flex } from '@commercetools/nimbus';
import { useComposePreviewContext } from '../../../contexts/compose-preview-context';
import { useSession } from '../../../contexts/session';
import { FeedbackPopup } from '../../new-chat/feedback-popup';
import { useMotion } from '../../../motion';
import type { TabId } from '../view-tabs';
import { HeaderActions } from './header-actions';
import { SessionMeta } from './session-meta';
import { SessionTitle } from './session-title';
import { ViewSwitcher } from './view-switcher';

type Props = {
  sessionId: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onNewChat: () => void;
  /**
   * Must REJECT on failure - that rejection is what keeps the popup open with the user's
   * typed comment intact.
   */
  onSubmitFeedback: (comment: string) => Promise<void>;
};

/**
 * The strip above a conversation: what this chat is called, what the assistant can reach,
 * and the actions that apply to the whole session.
 *
 * It exists because the session had no visible identity at all. The title was only ever
 * seen in the chats drawer, so a user returning to a tab had nothing on screen telling them
 * which of their conversations they were looking at.
 */
export const ConversationHeader: React.FC<Props> = ({
  sessionId,
  activeTab,
  onTabChange,
  onNewChat,
  onSubmitFeedback,
}) => {
  const motion = useMotion();
  const { allSessions, sessionTools } = useSession();
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // Nothing here is keyed on `sessionId`, so an open popup would otherwise survive a
  // session switch and silently rebind to the new conversation's messages.
  useEffect(() => {
    setIsFeedbackOpen(false);
  }, [sessionId]);
  const { previewData } = useComposePreviewContext();
  const current = allSessions.find((session) => session.id === sessionId);
  const toolCount = sessionTools.reduce(
    (total, group) => total + group.tools.filter((tool) => tool.enabled).length,
    0
  );

  return (
    <Box
      position="relative"
      flex="0 0 auto"
      borderBottomWidth="25"
      borderBottomStyle="solid"
      borderBottomColor="neutral.6"
      backgroundColor="bg"
      zIndex="5"
      {...motion.fadeIn()}
    >
      <Flex alignItems="center" gap="300" paddingX="600" paddingY="300">
        <Box color="primary.11" display="flex" flexShrink="0">
          <AutoAwesome width={20} height={20} />
        </Box>

        <Box minWidth="0" flex="1">
          <SessionTitle title={current?.title} />
          <SessionMeta
            toolCount={toolCount}
            createdAt={current?.createdAt}
            locale={dataLocale}
          />
        </Box>

        {previewData && (
          <ViewSwitcher activeTab={activeTab} onTabChange={onTabChange} />
        )}

        <HeaderActions
          onNewChat={onNewChat}
          onOpenFeedback={() => setIsFeedbackOpen((open) => !open)}
          isFeedbackOpen={isFeedbackOpen}
        />
      </Flex>

      {isFeedbackOpen && (
        <Box
          // Below the button that opened it, right-aligned with the header's
          // padding so the card cannot overflow the viewport on either side.
          position="absolute"
          top="calc(100% + 8px)"
          right="600"
          zIndex="60"
        >
          <FeedbackPopup
            onSubmit={onSubmitFeedback}
            onClose={() => setIsFeedbackOpen(false)}
          />
        </Box>
      )}
    </Box>
  );
};

export default ConversationHeader;
