/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/empty-state/greeting.tsx: the panel greets by
// the account's first name only (no e-mail fallback) and talks about the open page.

import React from 'react';
import { Heading, Text } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useMotion } from '../../../motion';

export const Greeting: React.FC = () => {
  const motion = useMotion();
  const firstName = useApplicationContext((context) => context.user?.firstName);

  return (
    <>
      <Heading
        as="h1"
        size="xl"
        fontWeight="600"
        color="neutral.12"
        marginBottom="150"
        {...motion.enter({ delay: 60 })}
      >
        {firstName ? `Hi ${firstName}, ` : ''}what should we look at?
      </Heading>
      <Text
        display="block"
        color="neutral.11"
        fontSize="350"
        marginBottom="600"
        {...motion.enter({ delay: 100 })}
      >
        Ask about the page you have open, or anything in your catalog, orders,
        pricing or promotions.
      </Text>
    </>
  );
};
