/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/user-avatar.tsx without the Gravatar lookup:
// the panel never reads the user's e-mail address, so the avatar shows initials only.

import React from 'react';
import { ChatMessage } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';

/** The signed-in user's avatar: initials of the Merchant Center account name. */
export const UserAvatar: React.FC = () => {
  const { firstName, lastName } = useApplicationContext((context) => ({
    firstName: context.user?.firstName,
    lastName: context.user?.lastName,
  }));

  return (
    <ChatMessage.Avatar
      firstName={firstName ?? undefined}
      lastName={lastName ?? undefined}
    />
  );
};
