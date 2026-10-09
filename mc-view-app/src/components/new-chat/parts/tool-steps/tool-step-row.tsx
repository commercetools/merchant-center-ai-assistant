/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import {
  CheckCircle,
  ErrorOutline,
  Handyman,
} from '@commercetools/nimbus-icons';
import { Box, Flex, Text } from '@commercetools/nimbus';
import { JsonBlock } from '../json-block';
import { useMotion } from '../../../../motion';
import type { ToolStep } from './collect-tool-steps';

type Props = {
  step: ToolStep;
  /** Detailed mode: show the payloads that went in and came out. */
  showPayloads: boolean;
};

const STATE_ICON = {
  done: CheckCircle,
  error: ErrorOutline,
  running: Handyman,
} as const;

const stateOf = (step: ToolStep): keyof typeof STATE_ICON => {
  if (step.state === 'output-error' || step.errorText) return 'error';
  if (step.state === 'output-available') return 'done';
  return 'running';
};

const STATE_COLOR = {
  done: 'positive.11',
  error: 'critical.11',
  running: 'neutral.9',
} as const;

/**
 * One step inside the disclosure: what it did, and the call it made.
 *
 * No duration. The design shows one per row, but nothing in the message parts records when
 * a tool started or finished - inventing a plausible number would be worse than the honest
 * omission, and the pill above already answers "how long did all this take" badly enough
 * by not claiming to.
 */
export const ToolStepRow: React.FC<Props> = ({ step, showPayloads }) => {
  const motion = useMotion();
  const state = stateOf(step);
  const Icon = STATE_ICON[state];

  return (
    <Box
      paddingY="200"
      paddingX="250"
      borderRadius="200"
      _hover={{ backgroundColor: 'neutral.2' }}
      {...motion.tint()}
    >
      <Flex alignItems="flex-start" gap="200">
        <Box
          flexShrink="0"
          color={STATE_COLOR[state]}
          display="flex"
          marginTop="25"
        >
          <Icon width={17} height={17} />
        </Box>
        <Box minWidth="0" flex="1">
          <Text display="block" fontSize="300" fontWeight="500">
            {step.label}
          </Text>
          <Text
            display="block"
            fontFamily="mono"
            fontSize="300"
            color="neutral.11"
            marginTop="25"
            truncate
            title={step.call}
          >
            {step.call}
          </Text>
        </Box>
      </Flex>

      {step.errorText && (
        <Text
          display="block"
          fontSize="300"
          color="critical.11"
          marginTop="100"
          marginLeft="500"
        >
          {step.errorText}
        </Text>
      )}

      {showPayloads && (
        <Box
          marginTop="150"
          marginLeft="500"
          maxHeight="320px"
          overflowY="auto"
        >
          {step.input !== undefined && step.input !== null && (
            <JsonBlock data={step.input} />
          )}
          {step.output !== undefined && step.output !== null && (
            <JsonBlock data={step.output} />
          )}
        </Box>
      )}
    </Box>
  );
};
