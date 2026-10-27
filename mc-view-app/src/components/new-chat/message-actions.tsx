/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/message-actions.tsx without the rating
// buttons: the panel has no feedback feature.

import React, { useCallback, useState } from 'react';
import { ContentCopy, Refresh } from '@commercetools/nimbus-icons';
import { Flex, IconButton } from '@commercetools/nimbus';
import type { UIMessage } from 'ai';
import { useMotion } from '../../motion';

type Props = {
  message: UIMessage;
  /** Only the newest reply can be regenerated; older ones have turns after them. */
  canRegenerate: boolean;
  onRegenerate: () => void;
};

const textOf = (message: UIMessage): string =>
  (message.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text?: string }).text ?? '')
    .join('\n\n')
    .trim();

/** Copy and retry under an assistant reply, dimmed until hovered or focused. */
export const MessageActions: React.FC<Props> = ({
  message,
  canRegenerate,
  onRegenerate,
}) => {
  const motion = useMotion();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = textOf(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; there is nothing useful to show.
    }
  }, [message]);

  return (
    <Flex
      gap="25"
      marginTop="200"
      opacity="0.55"
      _hover={{ opacity: '1' }}
      _focusWithin={{ opacity: '1' }}
      {...motion.tint()}
    >
      <IconButton
        aria-label={copied ? 'Copied' : 'Copy reply'}
        size="2xs"
        variant="ghost"
        onPress={handleCopy}
      >
        <ContentCopy />
      </IconButton>
      {canRegenerate && (
        <IconButton
          aria-label="Try again"
          size="2xs"
          variant="ghost"
          onPress={onRegenerate}
        >
          <Refresh />
        </IconButton>
      )}
    </Flex>
  );
};
