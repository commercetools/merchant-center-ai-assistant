/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Badge, Box, Flex, Stack, Text } from '@commercetools/nimbus';
import { useAuth } from '../../../contexts/auth';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { IdentityMcpConnection } from '../../configuration/identity-mcp-connection';

/**
 * Who the assistant is acting as.
 *
 * Worth a card of its own because it answers the question underneath every other setting:
 * the assistant reaches commercetools with the signed-in user's own permissions, so what
 * it can see and change is exactly what they can. Saying so here is what makes the tool
 * toggles below read as scope rather than as security.
 */
export const AccountCard: React.FC = () => {
  const { email, initials, displayName } = useCurrentUser();
  const { identityMcpConfigured } = useAuth();

  return (
    <Box
      borderWidth="25"
      borderStyle="solid"
      borderColor="neutral.6"
      borderRadius="300"
      padding="400"
    >
      <Flex alignItems="center" gap="250" marginBottom="200">
        <Flex
          flexShrink="0"
          width="34px"
          height="34px"
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          backgroundColor="primary.9"
          color="primary.contrast"
          fontSize="300"
          fontWeight="600"
        >
          {initials}
        </Flex>
        <Box flex="1" minWidth="0">
          <Text display="block" fontWeight="600" fontSize="350">
            {displayName}
          </Text>
          <Text display="block" fontSize="300" color="neutral.11" truncate>
            {email}
          </Text>
        </Box>
        {identityMcpConfigured && (
          <Badge colorPalette="positive" size="2xs">
            Connected
          </Badge>
        )}
      </Flex>

      <Text
        display="block"
        fontSize="300"
        color="neutral.11"
        marginBottom="300"
      >
        The assistant works with your permissions, so it can only reach the data
        you can reach.
      </Text>

      <Stack direction="column" gap="200">
        <IdentityMcpConnection />
      </Stack>
    </Box>
  );
};
