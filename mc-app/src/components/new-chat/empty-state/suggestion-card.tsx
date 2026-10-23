/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { iconFor } from '../../../utils/material-icons';
import { useMotion } from '../../../motion';
import type { PromptSuggestion } from '../../../hooks/use-chat-service-connector/types';

type Props = {
  suggestion: PromptSuggestion;
  index: number;
  onPick: (prompt: string) => void;
};

/**
 * One "start with" card. Picking it sends the prompt immediately rather than dropping it
 * into the composer to be edited: the cards exist to get a hesitant user past the blank
 * box, and making them fill in a form first defeats that.
 */
export const SuggestionCard: React.FC<Props> = ({
  suggestion,
  index,
  onPick,
}) => {
  const motion = useMotion();
  const Icon = iconFor(suggestion.icon);

  return (
    <Flex
      as="button"
      onClick={() => onPick(suggestion.prompt)}
      textAlign="left"
      cursor="pointer"
      gap="300"
      padding="400"
      backgroundColor="bg"
      borderWidth="25"
      borderStyle="solid"
      borderColor="neutral.6"
      borderRadius="300"
      _hover={{ boxShadow: '3', borderColor: 'primary.7' }}
      {...motion.enterStagger(index, { delay: 120 })}
      {...motion.interactive()}
    >
      <Flex
        flex="0 0 auto"
        width="34px"
        height="34px"
        alignItems="center"
        justifyContent="center"
        borderRadius="200"
        backgroundColor="primary.3"
        color="primary.11"
      >
        <Icon width={20} height={20} />
      </Flex>
      <Box minWidth="0">
        <Text display="block" fontWeight="600" fontSize="350" marginBottom="50">
          {suggestion.title}
        </Text>
        <Text
          display="block"
          fontSize="300"
          color="neutral.11"
          lineHeight="450"
        >
          {suggestion.detail}
        </Text>
      </Box>
    </Flex>
  );
};
