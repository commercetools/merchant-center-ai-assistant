/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ArrowOutward } from '@commercetools/nimbus-icons';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { useMotion } from '../../motion';

type Props = {
  text: string;
  index: number;
  onPick: () => void;
};

/** One suggested next message. Picking it sends immediately, like the empty-state cards. */
export const FollowUpChip: React.FC<Props> = ({ text, index, onPick }) => {
  const motion = useMotion();

  return (
    <Flex
      as="button"
      onClick={onPick}
      display="inline-flex"
      alignItems="center"
      gap="150"
      paddingY="150"
      paddingX="300"
      cursor="pointer"
      borderRadius="full"
      borderWidth="25"
      borderStyle="solid"
      borderColor="primary.7"
      backgroundColor="primary.2"
      color="primary.11"
      fontSize="300"
      fontWeight="500"
      _hover={{ backgroundColor: 'primary.3' }}
      {...motion.enterStagger(index)}
      {...motion.interactive()}
    >
      <Box display="flex" flexShrink="0">
        <ArrowOutward width={15} height={15} />
      </Box>
      <Text fontSize="300" fontWeight="500">
        {text}
      </Text>
    </Flex>
  );
};
