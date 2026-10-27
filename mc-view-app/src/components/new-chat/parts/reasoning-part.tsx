/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Box,
  CollapsibleMotion,
  Flex,
  Icon,
  IconButton,
  Markdown,
  Text,
} from '@commercetools/nimbus';
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Psychology,
} from '@commercetools/nimbus-icons';
import type { SystemStyleObject } from '@chakra-ui/react';

interface ReasoningPartRendererProps {
  text: string;
  state?: 'streaming' | 'done';
}

const reasoningMarkdownCss: SystemStyleObject = {
  fontSize: 'var(--nimbus-font-sizes-250) !important',
  lineHeight: 'var(--nimbus-line-heights-300) !important',
  fontWeight: 'var(--nimbus-font-weights-300) !important',

  '& strong, & b': {
    fontWeight: 'var(--nimbus-font-weights-500) !important',
  },

  '& .nimbus-code': {
    fontSize: 'var(--nimbus-font-sizes-250) !important',
  },
};

type TCssMarkdownProps = {
  css?: SystemStyleObject;
  isStreaming?: boolean;
  children: string;
};
const CssMarkdown = Markdown as React.FC<TCssMarkdownProps>;

/**
 * The model's reasoning, behind a disclosure.
 *
 * This is intermediate output, not the answer, so it is a single quiet line in the
 * transcript - an icon, a word, and one icon button on the right - rather than the
 * bordered `Accordion` card it was. `Accordion` brings a full-width header bar and its
 * own frame, which is a lot of furniture for one optional paragraph and made a reply with
 * several reasoning steps read as a stack of boxes.
 *
 * `CollapsibleMotion` is the same disclosure without the frame, and it animates the panel
 * in and out instead of snapping. The `Trigger asChild` form is what keeps the
 * accessibility intact while the visible control is an `IconButton`: react-aria hands the
 * button its `aria-expanded`/`aria-controls` and gives the panel a matching
 * `aria-labelledby`.
 *
 * Collapsed by default, as before - reasoning is opt-in detail. While it streams the label
 * says so and an `ActivityIndicator` runs next to it, so the panel never has to open itself
 * to show that something is happening.
 */
export const ReasoningPartRenderer: React.FC<ReasoningPartRendererProps> = ({
  text,
  state,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isStreaming = state === 'streaming';

  return (
    <CollapsibleMotion.Root
      width="100%"
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Flex alignItems="center" gap="200" minHeight="600">
        <Icon boxSize="400" color="neutral.11" flexShrink="0">
          <Psychology />
        </Icon>
        <Text fontSize="300" color="neutral.11">
          {isStreaming ? 'Thinking' : 'Thought'}
        </Text>
        {isStreaming && <ActivityIndicator size="2xs" colorPalette="neutral" />}
        <CollapsibleMotion.Trigger asChild>
          <IconButton
            marginInlineStart="auto"
            size="2xs"
            variant="ghost"
            colorPalette="neutral"
            aria-label="Model reasoning"
          >
            {isExpanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </CollapsibleMotion.Trigger>
      </Flex>
      <CollapsibleMotion.Content>
        {/* Capped and scrollable: a long chain of thought is the single biggest thing a
            reply can push into the transcript, and it is detail the reader opted into -
            not something that should push the answer off the screen. */}
        <Box
          paddingTop="100"
          paddingInlineStart="600"
          maxHeight="320px"
          overflowY="auto"
          color="neutral.11"
        >
          <CssMarkdown css={reasoningMarkdownCss} isStreaming={isStreaming}>
            {text}
          </CssMarkdown>
        </Box>
      </CollapsibleMotion.Content>
    </CollapsibleMotion.Root>
  );
};
