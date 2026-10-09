/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ConnectProvider, useConnect } from './connect';

export { AuthProvider, useAuth, ConnectProvider, useConnect };

// Changes P and Q append their providers inside ConnectProvider, in this order:
// Backoffice, ToolCallLogs, MCPConfig, SystemPrompt, ComposedPages, TabbedHeader, Session.
export const AllProviders = ({ children }: { children: ReactNode }) => {
  return (
    <AuthProvider>
      <ConnectProvider>{children}</ConnectProvider>
    </AuthProvider>
  );
};
