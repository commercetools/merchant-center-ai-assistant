/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box } from '@commercetools/nimbus';

type Props = {
  count: number;
};

/**
 * The small count on a rail item. Caps at 99 so a long-lived account cannot widen the rail.
 *
 * `aria-hidden`: the count is already in the rail item's accessible name ("Chats, 12
 * conversations"), and announcing it twice is worse than not showing it at all.
 */
export const RailBadge: React.FC<Props> = ({ count }) => {
  if (count <= 0) return null;

  return (
    <Box
      aria-hidden
      position="absolute"
      top="100"
      right="300"
      minWidth="500"
      height="500"
      paddingX="100"
      borderRadius="full"
      backgroundColor="primary.9"
      color="primary.contrast"
      fontSize="300"
      fontWeight="600"
      lineHeight="500"
      textAlign="center"
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
};
