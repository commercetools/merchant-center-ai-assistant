/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Badge, Link } from '@commercetools/nimbus';
import { InsertDriveFile, InsertLink } from '@commercetools/nimbus-icons';

interface SourceUrlPartRendererProps {
  url: string;
  title?: string;
}

/**
 * A web source the answer cites.
 *
 * `SourceLink` was an `<a>` styled to look like a link - Nimbus `Link` is that, with the
 * focus ring and visited/hover states from the design system. `target="_blank"` keeps
 * `rel="noopener noreferrer"`, which is what stops the opened page reaching back through
 * `window.opener`.
 */
export const SourceUrlPartRenderer: React.FC<SourceUrlPartRendererProps> = ({
  url,
  title,
}) => (
  <Link
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    size="sm"
    display="inline-flex"
    alignItems="center"
    gap="100"
    my="100"
  >
    <InsertLink />
    {title || url}
  </Link>
);

interface SourceDocumentPartRendererProps {
  title: string;
  mediaType: string;
  filename?: string;
}

/**
 * A document source the answer cites. Not a link - there is nothing to navigate to - so it
 * is a `Badge` rather than a `Link`: a label that reads as metadata about the answer.
 *
 * `mediaType` is part of the incoming part shape and stays in the props for that reason,
 * even though it is not displayed. It was already unused before this conversion.
 */
export const SourceDocumentPartRenderer: React.FC<
  SourceDocumentPartRendererProps
> = ({ title, filename }) => (
  <Badge colorPalette="neutral" size="xs">
    <InsertDriveFile />
    {title}
    {filename && ` (${filename})`}
  </Badge>
);
