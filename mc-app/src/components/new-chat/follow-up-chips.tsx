/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Flex } from '@commercetools/nimbus';
import type { NextPrompt } from '../../hooks/use-chat-service-connector/types';
import { FollowUpChip } from './follow-up-chip';

type Props = {
  prompts: NextPrompt[];
  onPick: (prompt: string) => void;
};

/**
 * Three things worth asking next, under the last reply.
 *
 * Nothing is rendered while the digest that produces them is still running - no spinner,
 * no placeholder row. They are an enhancement arriving a second or two after an answer
 * that is already complete and readable, and a loading state would draw attention to a
 * wait nobody was having.
 *
 * Indented to line up with the assistant's text rather than its avatar, so they read as
 * part of the reply rather than as a new message.
 */
export const FollowUpChips: React.FC<Props> = ({ prompts, onPick }) => {
  if (prompts.length === 0) return null;

  return (
    <Flex flexWrap="wrap" gap="200" paddingLeft="1100" paddingBottom="300">
      {prompts.map((prompt, index) => (
        <FollowUpChip
          key={`${prompt.text}-${index}`}
          text={prompt.text}
          index={index}
          onPick={() => onPick(prompt.prompt)}
        />
      ))}
    </Flex>
  );
};
