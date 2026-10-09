/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Alert, Button, Stack } from '@commercetools/nimbus';
import { LOGOUT_REASONS } from '@commercetools-frontend/constants';
import { useCallback, useState } from 'react';

type Props = {
  kind: 'unauthorized' | 'forbidden' | 'error';
  /** Message of the failed call, shown below the explanation for `error`. */
  detail?: string | null;
  onRetry: () => Promise<void>;
};

/** Full navigation, like app-kit's own user menu: no stale state survives the new session. */
const signInAgain = () => {
  window.location.assign(`/logout?reason=${LOGOUT_REASONS.UNAUTHORIZED}`);
};

/**
 * Visible failure of the session bootstrap (never a blank panel): 401 is a lapsed Merchant
 * Center session, 403 a project this service does not serve, anything else a service
 * failure. Retry re-runs the bootstrap.
 */
export const SessionError = ({ kind, detail, onRetry }: Props) => {
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  const title =
    kind === 'unauthorized'
      ? 'Your Merchant Center session has expired'
      : kind === 'forbidden'
      ? 'This project is not served by the configured AI Assistant'
      : 'The AI Assistant is unavailable';

  const description =
    kind === 'unauthorized'
      ? 'Sign in again to continue.'
      : kind === 'forbidden'
      ? 'The AI Assistant service is set up for a different project.'
      : detail || 'The service did not answer. Try again in a moment.';

  return (
    <Stack direction="column" gap="400" padding="400">
      <Alert.Root colorPalette="critical" variant="outlined">
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Root>
      <Stack direction="row" gap="200">
        {kind === 'unauthorized' && (
          <Button variant="solid" colorPalette="primary" onPress={signInAgain}>
            Sign in again
          </Button>
        )}
        {kind !== 'forbidden' && (
          <Button
            variant={kind === 'unauthorized' ? 'outline' : 'solid'}
            onPress={retry}
            isDisabled={retrying}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        )}
      </Stack>
    </Stack>
  );
};
