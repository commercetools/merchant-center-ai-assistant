/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Button, Stack, Text } from '@commercetools/nimbus';
import { useCallback, useEffect, useState } from 'react';
import type { IdentityMcpStatus } from '../../hooks/use-managed-mcp/types';
import { useIdentityMcpConfig } from '../../hooks/use-managed-mcp/use-identity-mcp-config';
import { useConnect } from '../../contexts/connect';
import { useSession } from '../../contexts/session';

export const IdentityMcpConnection = () => {
  const { fetchStatus, connectUser, disconnectUser, verifyUser } =
    useIdentityMcpConfig();
  const { recheck } = useConnect();
  const { fetchSessionTools } = useSession();
  const [status, setStatus] = useState<IdentityMcpStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await fetchStatus());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not read connection'
      );
    }
  }, [fetchStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await connectUser());
      await verifyUser();
      await fetchSessionTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity sign-in failed');
    } finally {
      setBusy(false);
    }
  }, [connectUser, fetchSessionTools, verifyUser]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await disconnectUser();
      // Re-gate via ConnectProvider: project stays bound, this user must reconnect.
      await recheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }, [disconnectUser, recheck]);

  return (
    <Stack direction="column" gap="300">
      <Text>
        {status?.connected
          ? 'Your Merchant Center account is connected. Tools are filtered by your permissions.'
          : 'Connect your Merchant Center account to use commercetools tools.'}
      </Text>
      <Stack direction="row" gap="200">
        {status?.connected ? (
          <Button
            variant="outline"
            colorPalette="critical"
            onPress={disconnect}
            isDisabled={busy}
          >
            Disconnect my account
          </Button>
        ) : (
          <Button
            variant="solid"
            colorPalette="primary"
            onPress={connect}
            isDisabled={busy || status === null}
          >
            Connect my account
          </Button>
        )}
      </Stack>
      {error && <Text color="critical.11">{error}</Text>}
    </Stack>
  );
};
