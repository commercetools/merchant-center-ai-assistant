/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useCustomViewContext } from '@commercetools-frontend/application-shell-connectors';
import {
  CUSTOM_VIEW_FLAG,
  encodeHostUrl,
  type FeatureFlags,
} from '../utils/feature-flags';

interface FeatureFlagsContextValue {
  featureFlags: FeatureFlags;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | undefined>(
  undefined
);

/**
 * The only feature flag is `customView` (the encoded host page URL). No user identity of
 * any kind goes into flags: the service learns who is calling from the gateway token.
 */
export const FeatureFlagsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { hostUrl } = useCustomViewContext((context) => ({
    hostUrl: context.hostUrl,
  }));

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ featureFlags: { [CUSTOM_VIEW_FLAG]: encodeHostUrl(hostUrl) } }),
    [hostUrl]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagsContext);
  if (context === undefined) {
    throw new Error(
      'useFeatureFlags must be used within a FeatureFlagsProvider'
    );
  }
  return context;
};

/** Feature flags context, or undefined outside the provider. */
export const useOptionalFeatureFlags = () => useContext(FeatureFlagsContext);
