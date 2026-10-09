/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Close } from '@commercetools/nimbus-icons';
import { Box, Flex, IconButton, Text } from '@commercetools/nimbus';
import type { SessionSummary } from '../../../hooks/use-chat-service-connector/types';
import { iconFor } from '../../../utils/material-icons';
import { formatRowTime } from '../../../utils/relative-time';
import { useMotion } from '../../../motion';

type Props = {
  session: SessionSummary;
  isActive: boolean;
  locale: string;
  onOpen: () => void;
  onRequestDelete: () => void;
};

/**
 * One conversation in the drawer: icon, title, what it was about, and when.
 *
 * The row and its delete button are SIBLINGS, not nested. This was previously a `<button>`
 * containing another `<button>`, which is invalid HTML and a real focus-order problem.
 *
 * Delete is revealed on row hover through a `group` class plus `_groupHover`, because a
 * styled-components component selector cannot target a Nimbus component - the generated
 * class simply is not on it.
 */
export const ChatRow: React.FC<Props> = ({
  session,
  isActive,
  locale,
  onOpen,
  onRequestDelete,
}) => {
  const motion = useMotion();
  const Icon = iconFor(session.icon);
  const title = session.title || 'Untitled chat';

  return (
    <Box
      className="group"
      display="flex"
      alignItems="flex-start"
      gap="200"
      paddingY="250"
      paddingX="300"
      borderRadius="200"
      backgroundColor={isActive ? 'primary.3' : 'transparent'}
      _hover={{ backgroundColor: isActive ? 'primary.3' : 'primary.2' }}
      {...motion.tint()}
    >
      <Flex
        as="button"
        onClick={onOpen}
        flex="1"
        minWidth="0"
        gap="200"
        alignItems="flex-start"
        textAlign="left"
        cursor="pointer"
        backgroundColor="transparent"
      >
        <Box flexShrink="0" color="neutral.9" display="flex" marginTop="25">
          <Icon width={18} height={18} />
        </Box>
        <Box minWidth="0" flex="1">
          <Text
            display="block"
            fontSize="300"
            fontWeight="500"
            color={isActive ? 'neutral.12' : 'neutral.12'}
            truncate
          >
            {title}
          </Text>
          {session.description && (
            <Text
              display="block"
              fontSize="300"
              color="neutral.11"
              marginTop="25"
              truncate
            >
              {session.description}
            </Text>
          )}
        </Box>
      </Flex>

      <Flex flexShrink="0" alignItems="center" gap="100" marginTop="25">
        {session.updatedAt !== undefined && (
          <Text fontSize="300" color="neutral.11" whiteSpace="nowrap">
            {formatRowTime(session.updatedAt, locale)}
          </Text>
        )}
        <IconButton
          aria-label={`Delete ${title}`}
          size="2xs"
          variant="ghost"
          colorPalette="critical"
          opacity="0"
          _groupHover={{ opacity: '1' }}
          onPress={onRequestDelete}
        >
          <Close />
        </IconButton>
      </Flex>
    </Box>
  );
};
