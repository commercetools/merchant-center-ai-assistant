/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Button, LoadingSpinner, Stack, Text } from '@commercetools/nimbus';
import { useCallback, useEffect, useState } from 'react';
import { useIdentityMcpConfig } from '../hooks/use-identity-mcp';

/**
 * Gate shown when the project has an identity MCP binding but this user has not connected.
 * `onConnected` must be stable (`useCallback`) or the status read below loops.
 */
export const IdentityMcpConnectGate = ({
  onConnected,
}: {
  onConnected: () => void;
}) => {
  const { fetchStatus, connectUser, verifyUser } = useIdentityMcpConfig();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const next = await fetchStatus();
        if (next.connected) onConnected();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not read connection status'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchStatus, onConnected]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await connectUser();
      await verifyUser();
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity sign-in failed');
    } finally {
      setBusy(false);
    }
  }, [connectUser, onConnected, verifyUser]);

  if (loading) {
    return (
      <Stack direction="column" gap="800" alignItems="center">
        <LoadingSpinner size="lg" />
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap="400" alignItems="center" maxWidth="480px">
      <Text>
        Connect your Merchant Center account to use commercetools tools. Tools
        are filtered by your permissions.
      </Text>
      <Button
        variant="solid"
        colorPalette="primary"
        onPress={connect}
        isDisabled={busy}
      >
        Connect my account
      </Button>
      {error && <Text color="critical.11">{error}</Text>}
    </Stack>
  );
};
