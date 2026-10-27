/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box, Text } from '@commercetools/nimbus';

/**
 * Shown when no pages exist. It names the phrase that creates one, because "composed
 * pages" is a feature nobody discovers by looking at an empty list - it only happens if
 * you already know to ask for it.
 */
export const PagesEmptyHint: React.FC = () => (
  <Box
    marginTop="400"
    padding="400"
    borderWidth="25"
    borderStyle="dashed"
    borderColor="neutral.7"
    borderRadius="300"
    textAlign="center"
  >
    <Text fontSize="300" color="neutral.11">
      Ask the assistant to &ldquo;build a page from this&rdquo; and it will show
      up here.
    </Text>
  </Box>
);
