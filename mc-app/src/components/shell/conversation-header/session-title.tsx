/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Text } from '@commercetools/nimbus';

type Props = {
  title?: string;
};

/**
 * The conversation's name in the header.
 *
 * Truncates rather than wraps: the header is a fixed-height strip and a two-line title
 * would push the transcript down every time the digest lands a longer name.
 */
export const SessionTitle: React.FC<Props> = ({ title }) => (
  <Text fontWeight="600" fontSize="350" truncate>
    {title || 'New chat'}
  </Text>
);
