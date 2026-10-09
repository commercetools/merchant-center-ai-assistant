/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import {
  AutoAwesome,
  DashboardCustomize,
  Forum,
  HelpOutline,
} from '@commercetools/nimbus-icons';
import { Box, Popover, Toolbar } from '@commercetools/nimbus';
import {
  useComposedPagesContext,
  useTabbedHeaderContext,
} from '../../../contexts';
import { useSession } from '../../../contexts/session';
import { useMotion } from '../../../motion';
import { UserAvatar } from '../../new-chat/user-avatar';
import { YourUserId } from '../../your-user-id';
import { NewChatTile } from './new-chat-tile';
import { RailItem } from './rail-item';

export type DrawerId = 'chats' | 'pages' | 'mcp' | 'config';

type Props = {
  openDrawer: DrawerId | null;
  onToggleDrawer: (drawer: DrawerId) => void;
  onNewChat: () => void;
};

const HELP_URL = 'https://docs.commercetools.com';

/**
 * The left rail: new chat, then the drawers, with help pinned to the bottom.
 *
 * A Nimbus `Toolbar` so react-aria gives the group roving focus - one tab stop, arrow keys
 * between the items - which is the correct interaction for a strip of related controls and
 * is what the previous icon toolbar already did. What is new is that every item carries a
 * visible label and, where it has one, a count.
 */
export const AppRail: React.FC<Props> = ({
  openDrawer,
  onToggleDrawer,
  onNewChat,
}) => {
  const motion = useMotion();
  const { allSessions } = useSession();
  const { pages } = useComposedPagesContext();
  const { highlightedTab, clearHighlight } = useTabbedHeaderContext();

  const isPagesHighlighted = highlightedTab === 'composed-page';

  const handlePages = () => {
    onToggleDrawer('pages');
    clearHighlight();
  };

  return (
    <Toolbar
      orientation="vertical"
      aria-label="Assistant navigation"
      width="84px"
      flex="0 0 84px"
      height="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="50"
      paddingX="200"
      paddingY="300"
      backgroundColor="bg"
      borderRightWidth="25"
      borderRightStyle="solid"
      borderRightColor="neutral.6"
    >
      <NewChatTile onPress={onNewChat} />

      <Box height="200" />

      <RailItem
        icon={Forum}
        label="Chats"
        count={allSessions.length}
        countLabel={`${allSessions.length} conversations`}
        isActive={openDrawer === 'chats'}
        onPress={() => onToggleDrawer('chats')}
      />

      <RailItem
        icon={DashboardCustomize}
        label="Pages"
        count={pages.length}
        countLabel={`${pages.length} composed pages`}
        isActive={openDrawer === 'pages' || isPagesHighlighted}
        onPress={handlePages}
      >
        {/*
         * The "a page was just built for you" nudge. It lives here rather than on the
         * Pages tab because the assistant can create a page at any moment, including
         * while the user is reading something else.
         */}
        {isPagesHighlighted && (
          <Box
            aria-hidden
            position="absolute"
            top="50"
            left="200"
            color="primary.9"
            pointerEvents="none"
            {...motion.pulse()}
          >
            <AutoAwesome width={14} height={14} />
          </Box>
        )}
      </RailItem>

      {/* Q: Connections (admin) and Settings items go here */}

      <Box flex="1" />

      <RailItem
        icon={HelpOutline}
        label="Help"
        onPress={() => window.open(HELP_URL, '_blank', 'noopener,noreferrer')}
      />

      {/*
       * The user menu. It holds the signed-in user's own user ID, which an operator needs
       * to put into ADMIN_USER_IDS; it is shown to every user, not only administrators.
       */}
      <Popover.Root placement="right bottom">
        <Popover.Trigger asChild>
          <Box
            as="button"
            aria-label="Account"
            background="transparent"
            border="none"
            cursor="pointer"
            padding="100"
          >
            <UserAvatar />
          </Box>
        </Popover.Trigger>
        <Popover.Content aria-label="Account" maxWidth="4800">
          <YourUserId variant="compact" />
        </Popover.Content>
      </Popover.Root>
    </Toolbar>
  );
};

export default AppRail;
