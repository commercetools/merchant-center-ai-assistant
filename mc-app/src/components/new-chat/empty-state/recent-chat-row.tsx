/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { iconFor } from '../../../utils/material-icons';
import { formatRowTime } from '../../../utils/relative-time';
import { useMotion } from '../../../motion';

type Props = {
  title: string;
  icon?: string;
  updatedAt?: number;
  locale: string;
  isLast: boolean;
  onOpen: () => void;
};

/**
 * One row of "pick up where you left off".
 *
 * `icon` and `updatedAt` are optional because a session only has them once its digest has
 * run. Older sessions, and one whose first turn is still in flight, render with the
 * fallback sparkle and no timestamp rather than a gap where those should be.
 */
export const RecentChatRow: React.FC<Props> = ({
  title,
  icon,
  updatedAt,
  locale,
  isLast,
  onOpen,
}) => {
  const motion = useMotion();
  const Icon = iconFor(icon);

  return (
    <Flex
      as="button"
      onClick={onOpen}
      width="100%"
      textAlign="left"
      cursor="pointer"
      gap="200"
      alignItems="flex-start"
      paddingY="300"
      paddingX="350"
      borderBottomWidth={isLast ? '0' : '25'}
      borderBottomStyle="solid"
      borderBottomColor="neutral.4"
      backgroundColor="transparent"
      _hover={{ backgroundColor: 'primary.2' }}
      {...motion.tint()}
    >
      <Box flexShrink="0" color="neutral.9" marginTop="25" display="flex">
        <Icon width={18} height={18} />
      </Box>
      <Box minWidth="0" flex="1">
        <Text display="block" fontSize="300" fontWeight="500" truncate>
          {title}
        </Text>
        {updatedAt !== undefined && (
          <Text
            display="block"
            fontSize="300"
            color="neutral.11"
            marginTop="25"
          >
            {formatRowTime(updatedAt, locale)}
          </Text>
        )}
      </Box>
    </Flex>
  );
};
