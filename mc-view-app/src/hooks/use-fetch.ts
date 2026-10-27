/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback } from 'react';
import { useOptionalFeatureFlags } from '../contexts/feature-flags-context';
import { applyFeatureFlagsToUrl } from '../utils/feature-flags';
import { forwardToFetch, toUri } from '../utils/forward-to';

/**
 * A `fetch`-shaped function that appends the feature flags (`customView`) to the service
 * URL and sends the request through the Merchant Center gateway. Every service call of this
 * panel except the identity connect flow goes through here, including the chat transport:
 * the flag is what makes the service scope the session to the host page and pick the
 * custom-view agent. Dropping it would silently turn the panel into a plain chat.
 */
export function useFetch(): typeof fetch {
  const featureFlags = useOptionalFeatureFlags()?.featureFlags;

  return useCallback<typeof fetch>(
    (input, init) =>
      forwardToFetch(applyFeatureFlagsToUrl(toUri(input), featureFlags), init),
    [featureFlags]
  );
}
