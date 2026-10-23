/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Flex, Text } from '@commercetools/nimbus';
import { useMotion } from '../../motion';
import { CuteTextAnimator } from './typing-indicator/cute-text-animator';

type Props = {
  /** What the assistant is doing right now, when there is something specific to say. */
  label?: string;
};

/**
 * "Still working" inside the reply that is being written.
 *
 * It lives in the assistant's own message rather than as a separate row at the bottom of
 * the list, so the answer appears where the indicator was instead of the transcript
 * shifting when the indicator is removed and the message takes its place.
 *
 * `CuteTextAnimator` is copy, not a loading affordance - it only fills the silence when
 * there is no specific label to show.
 */
export const ThinkingPill: React.FC<Props> = ({ label }) => {
  const motion = useMotion();

  return (
    <Flex
      display="inline-flex"
      alignItems="center"
      gap="250"
      paddingY="200"
      paddingX="300"
      backgroundColor="bg"
      borderWidth="25"
      borderStyle="solid"
      borderColor="neutral.6"
      borderRadius="300"
      {...motion.enter()}
    >
      <Text fontSize="300" color="neutral.11">
        {label ?? <CuteTextAnimator />}
      </Text>
    </Flex>
  );
};
