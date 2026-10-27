/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Text } from '@commercetools/nimbus';

/**
 * The permissions note under the composer.
 *
 * Worth the line of screen space: the assistant reaches the same commercetools project the
 * user is signed in to, and the question everyone asks first is what it is allowed to see
 * and change. Saying it where they are about to type answers it before it is asked.
 */
export const Disclaimer: React.FC = () => (
  <Text
    fontSize="300"
    color="neutral.11"
    textAlign="center"
    display="block"
    marginTop="200"
  >
    The assistant can only see and change what your Merchant Center permissions
    allow.
  </Text>
);
