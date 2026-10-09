/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Add, ThumbsUpDown } from '@commercetools/nimbus-icons';
import { Button, Flex } from '@commercetools/nimbus';

type Props = {
  onNewChat: () => void;
  onOpenFeedback: () => void;
  isFeedbackOpen: boolean;
};

/**
 * The header's right-hand actions.
 *
 * "Share" appears in the design and is deliberately absent here: nothing in the service
 * can share a conversation, and a button that does nothing is worse than no button.
 *
 * These two were previously a floating panel that hovered over the bottom-right of the
 * transcript, overlapping the last message and needing `pointerEvents: none` plumbing to
 * stop it swallowing clicks meant for the conversation behind it.
 */
export const HeaderActions: React.FC<Props> = ({
  onNewChat,
  onOpenFeedback,
  isFeedbackOpen,
}) => (
  <Flex alignItems="center" gap="100">
    <Button variant="ghost" size="xs" onPress={onNewChat}>
      <Add />
      New chat
    </Button>
    <Button
      variant="outline"
      size="xs"
      onPress={onOpenFeedback}
      aria-expanded={isFeedbackOpen}
    >
      <ThumbsUpDown />
      Feedback
    </Button>
  </Flex>
);
