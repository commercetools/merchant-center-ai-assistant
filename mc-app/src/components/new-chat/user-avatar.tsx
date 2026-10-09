/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ChatMessage } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useGravatarUrl } from '../../utils/gravatar';

/**
 * The signed-in user's avatar.
 *
 * Three tiers, in the order Nimbus `Avatar` resolves them: the Gravatar for the Merchant
 * Center account's email address, the account's initials while that image is loading or if
 * it 404s (the `d=404` in the URL is what makes the miss an error rather than a generated
 * placeholder), and Nimbus's own person icon if the account has no name either.
 *
 * The image and the initials are both rendered; `Avatar` keeps the image hidden until its
 * `onLoad` fires and re-hides it on `onError`, so the fallback is never a flash of nothing.
 *
 * `firstName`/`lastName` also name the avatar, which is what opts it back into the
 * accessibility tree - see the note in agent-avatar.tsx.
 */
export const UserAvatar: React.FC = () => {
  const { email, firstName, lastName } = useApplicationContext((context) => ({
    email: context.user?.email,
    firstName: context.user?.firstName,
    lastName: context.user?.lastName,
  }));

  const gravatarUrl = useGravatarUrl(email);

  return (
    <ChatMessage.Avatar
      src={gravatarUrl}
      firstName={firstName ?? undefined}
      lastName={lastName ?? undefined}
    />
  );
};
