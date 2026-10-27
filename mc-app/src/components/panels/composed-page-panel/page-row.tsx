/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ChevronRight } from '@commercetools/nimbus-icons';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { iconFor } from '../../../utils/material-icons';
import { formatRelative } from '../../../utils/relative-time';
import { useMotion } from '../../../motion';

type Props = {
  to: string;
  name: string;
  icon?: string;
  updatedAt?: string;
  locale: string;
};

/**
 * One page the assistant built, as a card rather than a table row.
 *
 * The previous row printed the icon NAME as text next to the title - `show_chart` rendered
 * literally - because there was nothing resolving it to a glyph. It goes through the same
 * icon map as everything else now, and falls back rather than printing an identifier.
 */
export const PageRow: React.FC<Props> = ({
  to,
  name,
  icon,
  updatedAt,
  locale,
}) => {
  const motion = useMotion();
  const Icon = iconFor(icon);
  const updated = updatedAt ? Date.parse(updatedAt) : NaN;

  return (
    <Box
      asChild
      display="flex"
      alignItems="center"
      gap="250"
      padding="300"
      borderWidth="25"
      borderStyle="solid"
      borderColor="neutral.6"
      borderRadius="300"
      cursor="pointer"
      color="inherit"
      textDecoration="none"
      _hover={{ borderColor: 'primary.7', boxShadow: '3' }}
      {...motion.interactive()}
    >
      <RouterLink to={to}>
        <Flex
          flexShrink="0"
          width="44px"
          height="44px"
          alignItems="center"
          justifyContent="center"
          borderRadius="200"
          backgroundColor="primary.3"
          color="primary.11"
        >
          <Icon width={22} height={22} />
        </Flex>

        <Box flex="1" minWidth="0">
          <Text display="block" fontSize="350" fontWeight="500" truncate>
            {name}
          </Text>
          {Number.isFinite(updated) && (
            <Text
              display="block"
              fontSize="300"
              color="neutral.11"
              marginTop="25"
            >
              Updated {formatRelative(updated, locale)}
            </Text>
          )}
        </Box>

        <Box flexShrink="0" color="neutral.9" display="flex">
          <ChevronRight width={20} height={20} />
        </Box>
      </RouterLink>
    </Box>
  );
};
