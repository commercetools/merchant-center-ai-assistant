/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Button, Code, Dialog, Stack, Text } from '@commercetools/nimbus';
import { LOGOUT_REASONS } from '@commercetools-frontend/constants';
import { useCallback, useState } from 'react';

/**
 * Modal that `ConnectProvider` puts up when the Merchant Center session bootstrap fails.
 *
 * The usual cause is a tab left open past the Merchant Center session's lifetime. The
 * `/proxy/forward-to` gateway then answers 401 ("Missing authentication token") - after its
 * own forced-token retry has failed too - and nothing behind it can load. Only a fresh
 * sign-in fixes that, so the primary action navigates to the shell's `/logout` route with
 * the `unauthorized` reason: the same URL app-kit itself redirects to when one of its own
 * GraphQL calls comes back unauthorized. The Merchant Center ends the session, shows the
 * sign-in page with a "session expired" notice, and returns the user to this application.
 *
 * Any other failure (router unreachable, 5xx, a `success: false` envelope) is not fixed by
 * signing in again, so that variant says so and leads with Retry. Sign in again stays as the
 * secondary action because permissions are read when a session is created, so a 403 can
 * still be cured that way.
 *
 * Not dismissable: there is nothing usable behind it, so closing it would only leave an
 * empty page.
 */

export type ReauthenticateDialogProps = {
  /** Message of the failed bootstrap, as stored by `AuthProvider`. */
  error: string | null;
  /** HTTP status of the failed bootstrap. 401 selects the session-expired copy. */
  status: number | null;
  /** Re-run the bootstrap. Settles once it has succeeded or failed again. */
  onRetry: () => Promise<void>;
};

const UNAUTHORIZED = 401;

/**
 * Full navigation rather than a router push, like app-kit's own user menu: the shell's
 * `/logout` route ends up at the Merchant Center's login page either way, and a fresh
 * document load guarantees no stale state survives into the new session.
 */
const signInAgain = () => {
  window.location.assign(`/logout?reason=${LOGOUT_REASONS.UNAUTHORIZED}`);
};

export const ReauthenticateDialog = ({
  error,
  status,
  onRetry,
}: ReauthenticateDialogProps) => {
  const sessionExpired = status === UNAUTHORIZED;
  const [retrying, setRetrying] = useState(false);
  // The installed Nimbus Button has no loading state, so the label carries it.
  const retryLabel = retrying ? 'Retrying…' : 'Retry';

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  return (
    <Dialog.Root isOpen isDismissable={false} isKeyboardDismissDisabled>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>
            {sessionExpired
              ? 'Your Merchant Center session has expired'
              : 'The AI Assistant could not start'}
          </Dialog.Title>
        </Dialog.Header>
        <Dialog.Body>
          <Stack direction="column" gap="400">
            {sessionExpired ? (
              <Text>
                This tab has been open for longer than your Merchant Center
                sign-in lasts, so the AI Assistant can no longer act on your
                behalf. Sign in again to continue - you will be brought back
                here afterwards.
              </Text>
            ) : (
              <Text>
                The assistant service did not answer as expected. This is
                usually temporary, so try again in a moment. If it keeps
                failing, signing in again refreshes your permissions; beyond
                that, contact whoever runs the assistant for your organization.
              </Text>
            )}

            {error && (
              <Stack direction="column" gap="100">
                <Text fontSize="sm" fontWeight="600" color="neutral.11">
                  Technical details
                </Text>
                <Code
                  as="pre"
                  variant="subtle"
                  colorPalette="neutral"
                  size="sm"
                  display="block"
                  width="100%"
                  p="250"
                  whiteSpace="pre-wrap"
                  wordBreak="break-all"
                >
                  {error}
                </Code>
              </Stack>
            )}
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          {sessionExpired ? (
            <>
              <Button variant="outline" onPress={retry} isDisabled={retrying}>
                {retryLabel}
              </Button>
              <Button
                variant="solid"
                colorPalette="primary"
                onPress={signInAgain}
                isDisabled={retrying}
              >
                Sign in again
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onPress={signInAgain}
                isDisabled={retrying}
              >
                Sign in again
              </Button>
              <Button
                variant="solid"
                colorPalette="primary"
                onPress={retry}
                isDisabled={retrying}
              >
                {retryLabel}
              </Button>
            </>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

ReauthenticateDialog.displayName = 'ReauthenticateDialog';

export default ReauthenticateDialog;
