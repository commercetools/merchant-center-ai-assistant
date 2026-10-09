/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ConnectProvider, useConnect } from './connect';
import { FeatureFlagsProvider, useFeatureFlags } from './feature-flags-context';
import { SessionProvider, useSession } from './session';
import {
  ToolCallLogsConfigProvider,
  useToolCallLogsConfigContext,
} from './tool-call-logs-config';

export {
  AuthProvider,
  useAuth,
  ConnectProvider,
  useConnect,
  FeatureFlagsProvider,
  useFeatureFlags,
  SessionProvider,
  useSession,
  ToolCallLogsConfigProvider,
  useToolCallLogsConfigContext,
};

// Nesting order (outermost first): FeatureFlags (the bootstrap already needs the flag),
// Auth, Connect (gates), ToolCallLogs, Session.
export const AllProviders = ({ children }: { children: ReactNode }) => (
  <FeatureFlagsProvider>
    <AuthProvider>
      <ConnectProvider>
        <ToolCallLogsConfigProvider>
          <SessionProvider autoCreateSession>{children}</SessionProvider>
        </ToolCallLogsConfigProvider>
      </ConnectProvider>
    </AuthProvider>
  </FeatureFlagsProvider>
);
