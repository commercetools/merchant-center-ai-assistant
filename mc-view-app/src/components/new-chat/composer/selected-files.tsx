/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Close } from '@commercetools/nimbus-icons';
import { Box, Flex, IconButton, Text } from '@commercetools/nimbus';
import { useMotion } from '../../../motion';

type Props = {
  files?: FileList;
  onRemoveFile: (index: number) => void;
};

/**
 * The row of removable chips for the files staged on the current message.
 *
 * Composed by hand rather than with `TagGroup`: `TagGroup.Tag` renders its own remove
 * button with a fixed, generic "Remove tag" label, and the per-file `Remove <name>` label
 * is the only thing that distinguishes one chip's button from the next for a screen reader.
 */
export const SelectedFiles: React.FC<Props> = ({ files, onRemoveFile }) => {
  const motion = useMotion();
  const fileArray = files ? Array.from(files) : [];

  if (fileArray.length === 0) return null;

  return (
    <Flex flexWrap="wrap" gap="100" marginBottom="200">
      {fileArray.map((file, index) => (
        <Flex
          key={`${file.name}-${file.size}-${file.lastModified}`}
          display="inline-flex"
          alignItems="center"
          gap="100"
          maxWidth="200px"
          paddingY="100"
          paddingX="200"
          backgroundColor="neutral.3"
          borderWidth="25"
          borderStyle="solid"
          borderColor="neutral.6"
          borderRadius="300"
          {...motion.fadeIn()}
        >
          <Text
            fontSize="300"
            color="neutral.12"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            title={file.name}
          >
            {file.name}
          </Text>
          {/* Never allowed to shrink away when the name is long. */}
          <Box flexShrink="0" display="inline-flex">
            <IconButton
              aria-label={`Remove ${file.name}`}
              variant="ghost"
              colorPalette="critical"
              size="2xs"
              onPress={() => onRemoveFile(index)}
            >
              <Close />
            </IconButton>
          </Box>
        </Flex>
      ))}
    </Flex>
  );
};
