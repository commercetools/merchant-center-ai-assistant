/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Card, Flex, Image, Stack, Text } from '@commercetools/nimbus';
import { InsertDriveFile } from '@commercetools/nimbus-icons';

interface FilePartRendererProps {
  mediaType: string;
  url: string;
  filename?: string;
}

/**
 * A file attached to a message: the image itself when it is one, otherwise its name and type.
 *
 * `FilePreview` (a tinted, rounded div) is a `Card`, `FileImage` an `Image`, `FileInfo` a
 * `Stack` and `FileName`/`FileType` two `Text`s. `FilePreview` also carried
 * `align-items: center; gap` under `display: block`, where neither has any effect - the flex
 * row those were written for now exists, as the `Flex` around the non-image case.
 */
export const FilePartRenderer: React.FC<FilePartRendererProps> = ({
  mediaType,
  url,
  filename,
}) => {
  const isImage = mediaType.startsWith('image/');

  return (
    <Card.Root
      variant="muted"
      colorPalette="neutral"
      size="sm"
      maxW="100%"
      overflow="hidden"
    >
      <Card.Body>
        {isImage ? (
          <Image
            src={url}
            alt={filename || 'Image'}
            maxW="100%"
            maxH="300px"
            objectFit="contain"
            borderRadius="150"
          />
        ) : (
          <Flex align="center" gap="200">
            <InsertDriveFile />
            <Stack direction="column" gap="50">
              <Text fontSize="350" fontWeight="500" color="neutral.12">
                {filename || 'File'}
              </Text>
              <Text fontSize="300" fontFamily="mono" color="neutral.11">
                {mediaType}
              </Text>
            </Stack>
          </Flex>
        )}
      </Card.Body>
    </Card.Root>
  );
};
