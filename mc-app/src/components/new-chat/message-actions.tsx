/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback, useState } from 'react';
import {
  ContentCopy,
  Refresh,
  ThumbDown,
  ThumbUp,
} from '@commercetools/nimbus-icons';
import { Flex, IconButton, Text } from '@commercetools/nimbus';
import type { UIMessage } from 'ai';
import { useMotion } from '../../motion';

type Props = {
  message: UIMessage;
  /** Only the newest reply can be regenerated; older ones have turns after them. */
  canRegenerate: boolean;
  onRegenerate: () => void;
  /** Submits the rating. Must REJECT on failure so the button does not claim success. */
  onRate: (sentiment: 'up' | 'down') => Promise<void>;
};

const textOf = (message: UIMessage): string =>
  (message.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text?: string }).text ?? '')
    .join('\n\n')
    .trim();

/**
 * Copy, rate and retry, under the last assistant reply.
 *
 * A thumb submits on the spot - one tap, no form. It used to open the comment popup
 * pre-filled, which turned a rating into a two-step commitment; most people abandoned at
 * the form and the signal was lost. The transcript is the payload either way and the
 * comment is optional, so an emoji alone is still a complete report. Anyone who wants to
 * say more still has Feedback in the header.
 *
 * Because nothing else confirms it landed, the pressed thumb stays filled and both are
 * then disabled - the button itself is the receipt. It only does that once the request
 * RESOLVES, so a failed submit leaves the buttons live to try again.
 *
 * Held at reduced opacity until the message is hovered or something inside is focused -
 * four icons under every reply would compete with the reply.
 */
export const MessageActions: React.FC<Props> = ({
  message,
  canRegenerate,
  onRegenerate,
  onRate,
}) => {
  const motion = useMotion();
  const [copied, setCopied] = useState(false);
  const [rated, setRated] = useState<'up' | 'down' | null>(null);
  const [isRating, setIsRating] = useState(false);

  const handleRate = useCallback(
    async (sentiment: 'up' | 'down') => {
      if (rated || isRating) return;
      setIsRating(true);
      try {
        await onRate(sentiment);
        setRated(sentiment);
      } catch {
        // Stays unrated, so the user can press the thumb again.
      } finally {
        setIsRating(false);
      }
    },
    [rated, isRating, onRate]
  );

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
      <IconButton
        aria-label={rated === 'up' ? 'Rated good' : 'Good answer'}
        aria-pressed={rated === 'up'}
        size="2xs"
        variant={rated === 'up' ? 'solid' : 'ghost'}
        colorPalette="positive"
        isDisabled={isRating || rated !== null}
        onPress={() => handleRate('up')}
      >
        <ThumbUp />
      </IconButton>
      <IconButton
        aria-label={rated === 'down' ? 'Rated needs work' : 'Needs work'}
        aria-pressed={rated === 'down'}
        size="2xs"
        variant={rated === 'down' ? 'solid' : 'ghost'}
        colorPalette="critical"
        isDisabled={isRating || rated !== null}
        onPress={() => handleRate('down')}
      >
        <ThumbDown />
      </IconButton>
      {rated && (
        <Text
          fontSize="300"
          color="neutral.11"
          alignSelf="center"
          marginLeft="100"
          // Announced once, when it appears - the disabled buttons alone would
          // not tell a screen reader user that anything was sent.
          role="status"
        >
          Thanks for the feedback
        </Text>
      )}
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
