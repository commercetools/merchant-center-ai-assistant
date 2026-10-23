/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { SmartToy } from '@commercetools/nimbus-icons';
import { useMotion } from '../../../motion';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { useTypewriter } from './use-typewriter';
import { CUTE_TEXT_PHRASES } from './cute-text-phrases';

/**
 * Animated cute text component that displays typing phrases
 * with a robot icon cursor while typing/deleting
 */
export const CuteTextAnimator: React.FC = () => {
  const motion = useMotion();
  const { displayText, isComplete } = useTypewriter({
    phrases: CUTE_TEXT_PHRASES,
    typingSpeed: 150,
    deletingSpeed: 80,
    pauseDuration: 5000,
  });

  return (
    <Flex alignItems="center" gap="100">
      {/* `minHeight` keeps the row from collapsing between phrases, when the
          typewriter has deleted the text down to an empty string. */}
      <Text
        fontSize="350"
        fontStyle="italic"
        color="neutral.11"
        minHeight="1.25em"
      >
        {displayText}
      </Text>
      {!isComplete && (
        <Box
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          // The assistant's accent, not `neutral.11`. A mid grey at 16px on the
          // agent bubble's white surface was already faint, and the marker spent
          // half its animation fully transparent on top of that.
          color="primary.11"
          {...motion.caret()}
        >
          <SmartToy width={16} height={16} />
        </Box>
      )}
    </Flex>
  );
};

export default CuteTextAnimator;
