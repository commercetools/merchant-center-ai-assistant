/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Edit } from '@commercetools/nimbus-icons';
import { Button, Text } from '@commercetools/nimbus';
import { useMotion } from '../../../motion';

type Props = {
  onPress: () => void;
};

/**
 * "New chat", the one action in the rail that is not a drawer.
 *
 * Solid rather than another ghost item on purpose: starting a fresh conversation is the
 * most common thing anyone does here, and in the rail this replaces it was a plain icon
 * indistinguishable from the four panels below it.
 *
 * The design asks for Material's `edit_square`, which Nimbus does not ship; `Edit` is the
 * closest thing in the set.
 */
export const NewChatTile: React.FC<Props> = ({ onPress }) => {
  const motion = useMotion();

  return (
    <Button
      variant="solid"
      colorPalette="primary"
      aria-label="Start a new chat"
      onPress={onPress}
      width="100%"
      height="auto"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="150"
      paddingX="0"
      paddingTop="200"
      paddingBottom="300"
      borderRadius="300"
      {...motion.tint()}
    >
      <Edit width={22} height={22} />
      <Text fontSize="300" fontWeight="600">
        New chat
      </Text>
    </Button>
  );
};
