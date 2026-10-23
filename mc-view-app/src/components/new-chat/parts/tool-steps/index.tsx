/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState } from 'react';
import { ExpandMore, TaskAlt, ErrorOutline } from '@commercetools/nimbus-icons';
import { Box, CollapsibleMotion, Flex, Text } from '@commercetools/nimbus';
import { useToolCallLogsConfigContext } from '../../../../contexts/tool-call-logs-config';
import { useMotion } from '../../../../motion';
import type { MessagePart } from '../../types';
import {
  collectToolSteps,
  countCompleted,
  hasFailure,
} from './collect-tool-steps';
import { ToolStepRow } from './tool-step-row';

type Props = {
  parts?: MessagePart[];
};

/**
 * Everything the assistant did before answering, as one line that expands.
 *
 * This replaces a stack of per-tool cards. A single reply routinely makes six or more
 * calls, each of which rendered as its own bordered box with a state badge and three
 * disclosure buttons - so the answer the user asked for arrived below a wall of plumbing,
 * and the subagent architecture nested those boxes several levels deep. One pill says how
 * many sources were consulted; opening it lists them; only Detailed mode shows payloads.
 *
 * The three detail levels come from the tool-call-logs setting:
 *  - Off      no pill at all
 *  - Summary  the pill and its step list
 *  - Detailed the same, plus the JSON that went in and came out
 */
export const ToolSteps: React.FC<Props> = ({ parts }) => {
  const motion = useMotion();
  const { showToolCalls, state } = useToolCallLogsConfigContext();
  const [isOpen, setIsOpen] = useState(false);

  const steps = collectToolSteps(parts);

  if (!showToolCalls || steps.length === 0) return null;

  const completed = countCompleted(steps);
  const failed = hasFailure(steps);
  const isWorking = completed < steps.length && !failed;

  const summary = failed
    ? 'Some steps did not finish'
    : isWorking
    ? `Checking ${steps.length} ${steps.length === 1 ? 'source' : 'sources'}`
    : `Checked ${completed} ${completed === 1 ? 'source' : 'sources'}`;

  return (
    <Box marginBottom="250" width="100%">
      <Flex
        as="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        display="inline-flex"
        alignItems="center"
        gap="200"
        paddingY="150"
        paddingLeft="250"
        paddingRight="300"
        cursor="pointer"
        borderWidth="25"
        borderStyle="solid"
        borderColor={failed ? 'critical.6' : 'neutral.6'}
        backgroundColor={failed ? 'critical.2' : 'bg'}
        borderRadius="full"
        _hover={{ borderColor: 'primary.7', backgroundColor: 'primary.2' }}
        {...motion.tint()}
      >
        <Box
          display="flex"
          color={failed ? 'critical.11' : 'positive.11'}
          flexShrink="0"
        >
          {failed ? (
            <ErrorOutline width={16} height={16} />
          ) : (
            <TaskAlt width={16} height={16} />
          )}
        </Box>
        <Text fontSize="300" fontWeight="500" color="neutral.12">
          {summary}
        </Text>
        <Box
          display="flex"
          color="neutral.11"
          transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
          {...motion.tint()}
        >
          <ExpandMore width={16} height={16} />
        </Box>
      </Flex>

      <CollapsibleMotion.Root
        width="100%"
        isExpanded={isOpen}
        onExpandedChange={setIsOpen}
      >
        <CollapsibleMotion.Content>
          <Box
            marginTop="200"
            padding="100"
            borderWidth="25"
            borderStyle="solid"
            borderColor="neutral.6"
            borderRadius="300"
            backgroundColor="bg"
          >
            {steps.map((step) => (
              <ToolStepRow
                key={step.id}
                step={step}
                showPayloads={state.mode === 'all'}
              />
            ))}
          </Box>
        </CollapsibleMotion.Content>
      </CollapsibleMotion.Root>
    </Box>
  );
};

export default ToolSteps;
