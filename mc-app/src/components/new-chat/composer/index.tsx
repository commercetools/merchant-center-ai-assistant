/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback, useState } from 'react';
import { ErrorOutline } from '@commercetools/nimbus-icons';
import {
  Box,
  Button,
  Flex,
  MultilineTextInput,
  Text,
} from '@commercetools/nimbus';
import { useSession } from '../../../contexts/session';
import { useMotion } from '../../../motion';
import { CHAT_COLUMN_WIDTH } from '../layout';
import { AttachButton } from './attach-button';
import { Disclaimer } from './disclaimer';
import { SelectedFiles } from './selected-files';
import { SendButton } from './send-button';
import { SendHint } from './send-hint';
import { SourcesPanel } from './sources-panel';
import { ToolsButton } from './tools-button';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error?: Error | null;
  files?: FileList;
  onFilesChange?: (files: FileList | undefined) => void;
};

/**
 * The message box, and everything attached to it.
 *
 * ONE instance of this exists per session, and it is deliberately rendered from a single
 * place in the tree whether the session is empty or not. In the empty state the column
 * around it is centred, so it sits in the middle of the screen under the suggestions; once
 * there are messages the transcript takes the space above and this drops to the bottom.
 * Because the element never unmounts, the caret stays where it was, typed text and staged
 * files survive, and `useFlipTransition` in the parent has a stable node to glide between
 * the two positions.
 */
export const Composer: React.FC<Props> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  error,
  files,
  onFilesChange,
}) => {
  const motion = useMotion();
  const { sessionTools } = useSession();
  const [isErrorVisible, setIsErrorVisible] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const hasText = value.trim().length > 0;

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (hasText && !isLoading) onSubmit();
    },
    [hasText, isLoading, onSubmit]
  );

  /**
   * Enter sends; Shift+Enter inserts a newline. Cmd/Ctrl+Enter keeps working, because it
   * was the only way to send before the redesign and fingers remember.
   *
   * Caught on the wrapper rather than the input: `MultilineTextInput`'s `onChange` hands
   * back the value rather than an event, so there is no keyboard handler on it to use.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      if (hasText && !isLoading) onSubmit();
    },
    [hasText, isLoading, onSubmit]
  );

  const handleRemoveFile = useCallback(
    (indexToRemove: number) => {
      if (!files) return;
      const next = new DataTransfer();
      Array.from(files).forEach((file, index) => {
        if (index !== indexToRemove) next.items.add(file);
      });
      onFilesChange?.(next.files.length === 0 ? undefined : next.files);
    },
    [files, onFilesChange]
  );

  const activeSourceCount = sessionTools.filter((group) =>
    group.tools.some((tool) => tool.enabled)
  ).length;

  return (
    <Box width="100%" maxWidth={CHAT_COLUMN_WIDTH} marginX="auto">
      {error && (
        <Box marginBottom="200">
          <Button
            variant="ghost"
            size="xs"
            colorPalette="critical"
            onPress={() => setIsErrorVisible(!isErrorVisible)}
          >
            <ErrorOutline />
            {isErrorVisible ? 'Hide error' : 'Show error'}
          </Button>
          {isErrorVisible && (
            <Text fontSize="350" color="critical.11">
              {error.message}
            </Text>
          )}
        </Box>
      )}

      <SelectedFiles files={files} onRemoveFile={handleRemoveFile} />

      <Box
        as="form"
        onSubmit={handleSubmit}
        backgroundColor="bg"
        borderWidth="25"
        borderStyle="solid"
        borderColor="neutral.6"
        borderRadius="400"
        boxShadow="2"
        paddingTop="200"
        paddingX="200"
        paddingBottom="150"
        _focusWithin={{ borderColor: 'primary.8', boxShadow: '3' }}
        {...motion.tint()}
      >
        <Box onKeyDown={handleKeyDown}>
          <MultilineTextInput
            value={value}
            onChange={onChange}
            placeholder="Ask about products, orders, pricing or promotions…"
            isDisabled={isLoading}
            autoFocus
            autoGrow
            // The Nimbus recipe sets `root { display: inline-flex }` with no width, so
            // without this the box sizes to the textarea's `cols=20` default.
            width="100%"
            // The recipe also sets `resize: vertical`, which fights `autoGrow` - two
            // things owning the height. autoGrow wins; drop the handle.
            resize="none"
            variant="ghost"
          />
        </Box>

        <Flex alignItems="center" gap="50" paddingTop="100">
          <AttachButton onFilesChange={onFilesChange} isDisabled={isLoading} />
          <ToolsButton
            sourceCount={activeSourceCount}
            isOpen={isToolsOpen}
            onToggle={() => setIsToolsOpen((open) => !open)}
          />
          <Box flex="1" />
          <SendHint hasText={hasText} />
          <SendButton isDisabled={!hasText || isLoading} />
        </Flex>

        {isToolsOpen && <SourcesPanel />}
      </Box>

      <Disclaimer />
    </Box>
  );
};

export default Composer;
