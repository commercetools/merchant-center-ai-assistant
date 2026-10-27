/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Heading, Text } from '@commercetools/nimbus';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { useMotion } from '../../../motion';

/**
 * The opening line of a new session.
 *
 * It uses the user's first name because the Merchant Center already knows it and a blank
 * assistant screen is the one place in the product where addressing someone directly reads
 * as helpful rather than familiar. The second line is the real work: it says what this
 * assistant can actually do, which "How can I help you today?" - the placeholder this
 * replaces - did not.
 */
export const Greeting: React.FC = () => {
  const motion = useMotion();
  const { displayName } = useCurrentUser();

  return (
    <>
      <Heading
        as="h1"
        size="2xl"
        fontWeight="600"
        color="neutral.12"
        marginBottom="150"
        {...motion.enter({ delay: 60 })}
      >
        Hi {displayName}, what should we work on?
      </Heading>
      <Text
        display="block"
        color="neutral.11"
        fontSize="400"
        maxWidth="620px"
        marginBottom="800"
        {...motion.enter({ delay: 100 })}
      >
        Ask about your catalog, orders, pricing or promotions. I can look things
        up, draft changes for your review and build a page from the result.
      </Text>
    </>
  );
};
