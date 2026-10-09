/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useMemo } from 'react';

export type CurrentUser = {
  /**
   * Falls back to `'anonymous'`, which every identity site on the chat surface already uses.
   * It has to: sessions were CREATED under this value, and the router checks ownership
   * against it while rejecting an empty `?userEmail=` outright.
   */
  email: string;
  firstName: string;
  lastName: string;
  /** First name where there is one, otherwise the local part of the email. Never empty. */
  displayName: string;
  /** One or two letters for an avatar. Never empty. */
  initials: string;
};

const initialsFrom = (
  firstName: string,
  lastName: string,
  email: string
): string => {
  const fromName = `${firstName.trim().charAt(0)}${lastName
    .trim()
    .charAt(0)}`.trim();
  if (fromName) return fromName.toUpperCase();
  const fromEmail = email.trim().charAt(0);
  return (fromEmail || '?').toUpperCase();
};

/**
 * The signed-in Merchant Center user, in the shape the chat surface actually needs.
 *
 * Before this existed, every component re-derived `context.user?.email || 'anonymous'` by
 * hand, and the greeting and avatar had nowhere to get a name from at all.
 */
export const useCurrentUser = (): CurrentUser => {
  const { email, firstName, lastName } = useApplicationContext((context) => ({
    email: context.user?.email || 'anonymous',
    firstName: context.user?.firstName || '',
    lastName: context.user?.lastName || '',
  }));

  return useMemo(() => {
    const displayName = firstName.trim() || email.split('@')[0] || 'there';
    return {
      email,
      firstName,
      lastName,
      displayName,
      initials: initialsFrom(firstName, lastName, email),
    };
  }, [email, firstName, lastName]);
};
