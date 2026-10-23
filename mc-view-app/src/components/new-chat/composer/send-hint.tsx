/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Text } from '@commercetools/nimbus';

type Props = {
  hasText: boolean;
};

/**
 * The keyboard hint beside the send button.
 *
 * It changes with the state of the box on purpose: with nothing typed, the useful thing to
 * know is that the composer takes multi-line input at all; once there is text, the useful
 * thing is how to send it.
 */
export const SendHint: React.FC<Props> = ({ hasText }) => (
  <Text fontSize="300" color="neutral.11" marginRight="200">
    {hasText ? 'Enter to send' : 'Shift + Enter for a new line'}
  </Text>
);
