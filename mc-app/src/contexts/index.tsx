/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ConnectProvider, useConnect } from './connect';
import { SessionProvider, useSession } from './session';
import {
  ToolCallLogsConfigProvider,
  useToolCallLogsConfigContext,
} from './tool-call-logs-config';
import {
  ComposedPagesProvider,
  useComposedPagesContext,
} from './composed-pages-context';
import {
  TabbedHeaderProvider,
  useTabbedHeaderContext,
} from './tabbed-header-context';

export {
  AuthProvider,
  useAuth,
  ConnectProvider,
  useConnect,
  SessionProvider,
  useSession,
  ToolCallLogsConfigProvider,
  useToolCallLogsConfigContext,
  ComposedPagesProvider,
  useComposedPagesContext,
  TabbedHeaderProvider,
  useTabbedHeaderContext,
};

// Nesting order (outermost first): Auth, Connect, [Q: Backoffice], ToolCallLogs,
// [Q: McpProviders, SystemPromptConfig], ComposedPages, TabbedHeader, Session.
export const AllProviders = ({ children }: { children: ReactNode }) => {
  return (
    <AuthProvider>
      <ConnectProvider>
        {/* Q: BackofficeProvider */}
        <ToolCallLogsConfigProvider>
          {/* Q: McpProvidersProvider, SystemPromptConfigProvider */}
          <ComposedPagesProvider>
            <TabbedHeaderProvider>
              <SessionProvider autoCreateSession>{children}</SessionProvider>
            </TabbedHeaderProvider>
          </ComposedPagesProvider>
        </ToolCallLogsConfigProvider>
      </ConnectProvider>
    </AuthProvider>
  );
};
