/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Close } from '@commercetools/nimbus-icons';
import {
  Alert,
  Box,
  Button,
  Heading,
  IconButton,
  MultilineTextInput,
  Stack,
  Text,
} from '@commercetools/nimbus';

type Props = {
  /**
   * Must REJECT on failure - that rejection is the contract that keeps this
   * popup open with the user's typed comment intact.
   */
  onSubmit: (comment: string) => Promise<void>;
  onClose: () => void;
};

/**
 * The in-chat feedback popup, rendered inside the floating actions panel.
 *
 * NOT built on Nimbus `Popover`, despite that being the obvious component: `Popover` is not
 * exported from `@commercetools/nimbus` 3.5.1 - it is marked "only used internally" and is
 * absent from the public barrel, so importing it does not typecheck. (The documentation site
 * is ahead of the installed version here.) This is therefore an anchored `Box` composed from
 * public Nimbus primitives, which removes the custom CSS without depending on an internal
 * component. If `Popover` is made public in a later release this becomes a small swap - and
 * the two behaviours below are exactly what would have to be re-asserted through its props.
 *
 * Two behaviours here are deliberate decisions, not omissions:
 *
 * 1. There is NO full-screen overlay and NO `document` mousedown listener, so
 *    clicking outside does NOT close the popup. The user is expected to look
 *    back at the conversation while writing the report, and an outside-click
 *    dismissal would throw away what they had typed. Closing is explicit:
 *    the X, the Close button, or Escape. (Under `Popover` this would need
 *    `shouldCloseOnInteractOutside={() => false}`, since react-aria dismisses
 *    on outside interaction by default.)
 * 2. Submit is NEVER disabled for an empty comment. The comment is optional,
 *    so an empty submit is a legitimate "the whole session was bad" signal;
 *    the snapshot is the payload. Only an in-flight submit disables it.
 */
export const FeedbackPopup = ({ onSubmit, onClose }: Props) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors `isSubmitting` for the double-click guard below.
  const isSubmittingRef = useRef(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    // Guard on the ref, not on the `isSubmitting` state: two clicks in the
    // same tick both run against the pre-render closure, so a state check
    // would let the second one through and post a second multi-MB snapshot.
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(comment);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      // Only after the submit RESOLVES. The popup closing is the only success
      // confirmation, so it must never close on a failed submit.
      onClose();
    } catch (submitError) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : 'Failed to submit feedback'
      );
    }
  }, [comment, onClose, onSubmit]);

  // LOCAL key handling - no global/document listener.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // Not while submitting: unmounting mid-flight would drop the report
      // without telling the user whether it landed.
      if (!isSubmittingRef.current) {
        onClose();
      }
      return;
    }

    // Cmd/Ctrl+Enter submits. Plain Enter must stay a newline in the textarea.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      void handleSubmit();
    }
  };

  return (
    <Box
      role="dialog"
      aria-label="Feedback"
      onKeyDown={handleKeyDown}
      // Deliberately NOT positioned here. This used to anchor itself upward
      // (`bottom: calc(100% + 8px)`), which was right when it hung off a button
      // pinned near the BOTTOM of the viewport. The trigger now lives in the
      // conversation header at the top, where opening upward puts the card off
      // the top of the screen. Anchoring belongs to whoever owns the trigger, so
      // the caller positions it and this is just the card.
      width="320px"
      maxHeight="min(360px, 45vh)"
      overflowY="auto"
      zIndex="1000"
      textAlign="left"
      cursor="default"
      display="flex"
      flexDirection="column"
      gap="200"
      padding="400"
      backgroundColor="bg"
      borderWidth="25"
      borderStyle="solid"
      borderColor="neutral.6"
      borderRadius="300"
      boxShadow="6"
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        gap="200"
      >
        <Stack direction="column" gap="100">
          <Heading as="h3">Feedback</Heading>
          <Text textStyle="xs" color="neutral.11">
            we will look into the whole history of this session
          </Text>
        </Stack>
        <IconButton
          aria-label="Close feedback"
          size="2xs"
          variant="ghost"
          onPress={onClose}
          isDisabled={isSubmitting}
        >
          <Close />
        </IconButton>
      </Stack>

      <MultilineTextInput
        ref={textAreaRef}
        value={comment}
        // Nimbus hands the value straight through, not a change event.
        onChange={setComment}
        placeholder="what went wrong"
        isDisabled={isSubmitting}
        aria-label="What went wrong"
        width="100%"
        rows={4}
      />

      {error && (
        <Alert.Root colorPalette="critical" variant="outlined">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      )}

      <Stack direction="row" gap="200" justifyContent="flex-end">
        <Button
          variant="outline"
          colorPalette="primary"
          size="xs"
          onPress={onClose}
          isDisabled={isSubmitting}
        >
          Close
        </Button>
        <Button
          variant="solid"
          colorPalette="primary"
          size="xs"
          onPress={() => {
            void handleSubmit();
          }}
          isDisabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting…' : 'Submit'}
        </Button>
      </Stack>
    </Box>
  );
};
