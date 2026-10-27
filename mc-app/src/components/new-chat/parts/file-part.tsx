/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import {
  Button,
  Card,
  Flex,
  Image,
  Skeleton,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { InsertDriveFile } from '@commercetools/nimbus-icons';
import {
  SERVICE_FILE_PREFIX,
  useServiceImage,
} from '../../../hooks/use-service-image';

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
/**
 * The image of a file part. Three kinds of source:
 *  - `/files/...` (private, service-relative): fetched through the gateway, see
 *    `useServiceImage`; skeleton while loading, "Image unavailable" with Retry on failure.
 *  - `https://...` (public mode): a plain image that sends no referrer.
 *  - `data:image/...` / `blob:` (the user's own just-attached files): shown as they are.
 * Anything else renders nothing.
 */
const ImageSource: React.FC<{ url: string; filename?: string }> = ({
  url,
  filename,
}) => {
  const service = useServiceImage(url);
  const alt = filename || 'Generated image';

  if (url.startsWith(SERVICE_FILE_PREFIX)) {
    if (service.status === 'ready') {
      return (
        <Image
          src={service.objectUrl}
          alt={alt}
          loading="lazy"
          maxW="100%"
          maxH="300px"
          objectFit="contain"
          borderRadius="150"
        />
      );
    }
    if (service.status === 'error') {
      return (
        <Stack direction="row" alignItems="center" gap="200">
          <Text color="neutral.11">Image unavailable</Text>
          <Button size="xs" variant="outline" onPress={service.retry}>
            Retry
          </Button>
        </Stack>
      );
    }
    return <Skeleton width="100%" style={{ aspectRatio: '4 / 3' }} />;
  }

  if (/^https:\/\//i.test(url)) {
    return (
      <Image
        src={url}
        alt={alt}
        referrerPolicy="no-referrer"
        maxW="100%"
        maxH="300px"
        objectFit="contain"
        borderRadius="150"
      />
    );
  }

  if (/^data:image\//i.test(url) || url.startsWith('blob:')) {
    return (
      <Image
        src={url}
        alt={alt}
        maxW="100%"
        maxH="300px"
        objectFit="contain"
        borderRadius="150"
      />
    );
  }

  return null;
};

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
          <ImageSource url={url} filename={filename} />
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
