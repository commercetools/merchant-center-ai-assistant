/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Stack, Text } from '@commercetools/nimbus';
import { YourUserId } from '../../your-user-id';

/**
 * About: shown to every user. An operator needs their own user ID to put it into the
 * service's ADMIN_USER_IDS, and they need it before they are an administrator.
 */
export const AboutSection: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => (
  <Stack direction="column" gap="200" aria-label="About">
    <Text fontWeight="600" fontSize="350">
      About
    </Text>
    <YourUserId variant="footer" />
    {!isAdmin && (
      <Text fontSize="300" color="neutral.11">
        Ask an administrator to add your user ID to ADMIN_USER_IDS
      </Text>
    )}
  </Stack>
);
