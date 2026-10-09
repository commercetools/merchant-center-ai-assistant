/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { ComposedPagesProvider } from './composed-pages-context';

// Pages are read straight from commercetools, so the app renders whether or not the AI
// service exists.
export const AllProviders = ({ children }: { children: ReactNode }) => (
  <ComposedPagesProvider>{children}</ComposedPagesProvider>
);
AllProviders.displayName = 'AllProviders';
