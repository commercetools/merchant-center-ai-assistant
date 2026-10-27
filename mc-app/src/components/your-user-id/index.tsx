/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Stack, Text } from '@commercetools/nimbus';
import { useAuth } from '../../contexts/auth';

type Props = {
  /** `compact` for the user menu, `footer` for page footers and Settings > About. */
  variant?: 'compact' | 'footer';
};

const COPIED_MS = 2000;

/**
 * Shows the signed-in user's own Merchant Center user id with a Copy button.
 *
 * An operator needs this value to put themselves into `ADMIN_USER_IDS`, and they need it
 * before they are an administrator, so it is shown to everyone. It is read-only text with
 * no form field, no link, no e-mail and no request. The id comes from the session bootstrap.
 */
export const YourUserId: React.FC<Props> = ({ variant = 'compact' }) => {
  const { userId } = useAuth();
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = useCallback(async () => {
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
    } catch {
      // Clipboard denied: select the text so the user can copy it by hand.
      const node = valueRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, [userId]);

  if (!userId) return null;

  return (
    <Stack
      direction={variant === 'footer' ? 'row' : 'column'}
      alignItems={variant === 'footer' ? 'center' : 'flex-start'}
      gap="100"
    >
      <Text fontSize={variant === 'footer' ? '300' : '350'}>Your user ID:</Text>
      <Text
        as="span"
        ref={valueRef}
        fontFamily="mono"
        fontSize="300"
        wordBreak="break-all"
      >
        {userId}
      </Text>
      <Button size="xs" variant="outline" onPress={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Stack>
  );
};

export default YourUserId;
