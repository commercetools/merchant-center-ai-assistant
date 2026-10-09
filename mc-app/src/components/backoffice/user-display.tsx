/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Text } from '@commercetools/nimbus';
import React from 'react';

type Props = {
  /** Gateway-verified user id. The only identity that is ever filtered or joined on. */
  userId: string;
  /** What the browser claimed at submit time. Display only. */
  userLabel?: string;
};

/**
 * A user as the backoffice shows them: the verified id, then - when the submitter supplied
 * one - the label as plain text tagged "(unverified)". The label is a text node only: never
 * HTML, never a link, never a filter or join key, because anyone can type anything there.
 */
export const UserDisplay: React.FC<Props> = ({ userId, userLabel }) => (
  <Text
    as="span"
    truncate
    title={userLabel ? `${userId} ${userLabel}` : userId}
  >
    {userId}
    {userLabel ? (
      <>
        {' '}
        <Text as="span" color="neutral.11">
          {userLabel}
        </Text>{' '}
        <Text as="span" color="neutral.11" fontSize="300">
          (unverified)
        </Text>
      </>
    ) : null}
  </Text>
);

export default UserDisplay;
