/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Text } from '@commercetools/nimbus';

/**
 * The small uppercase heading over each half of the empty state. Not a `Heading`: these
 * label two peer lists inside one screen, and promoting them to real headings would put
 * two competing h2s under the greeting in the document outline.
 */
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Text
    display="block"
    fontSize="300"
    fontWeight="600"
    letterSpacing="0.04em"
    textTransform="uppercase"
    color="neutral.11"
  >
    {children}
  </Text>
);
