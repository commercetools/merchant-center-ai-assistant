/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  Box,
  Button,
  Card,
  Code,
  Heading,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { useCallback, useEffect, useState } from 'react';
import type {
  IdentityMcpBinding,
  IdentityMcpStatus,
} from '../../hooks/use-managed-mcp/types';
import { useIdentityMcpConfig } from '../../hooks/use-managed-mcp/use-identity-mcp-config';

/**
 * Per-user OAuth gate when the project already has an identity MCP binding.
 *
 * Shown by ConnectProvider for any user (admin or not) who has not yet connected
 * their Merchant Center account. Does not offer admin bind/rebind — that lives on
 * ManagedMcpPage (no binding) and the Manage MCP drawer (from chat).
 */

const IdentityConnectGate = ({ onConnected }: { onConnected?: () => void }) => {
  const { fetchBinding, fetchStatus, connectUser, verifyUser } =
    useIdentityMcpConfig();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [binding, setBinding] = useState<IdentityMcpBinding | null>(null);
  const [status, setStatus] = useState<IdentityMcpStatus>({
    configured: false,
    connected: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    /*
     * Stays true when this user turns out to be connected already: the form has nothing to
     * offer them, so the spinner holds until `onConnected` swaps this gate for the chat
     * shell rather than flashing a sign-in screen they do not need.
     */
    let handedOff = false;
    try {
      const [nextBinding, nextStatus] = await Promise.all([
        fetchBinding(),
        fetchStatus(),
      ]);
      setBinding(nextBinding);
      setStatus(nextStatus);
      if (nextStatus.connected) {
        /*
         * The service says there is a token for this user against this binding. Verify it
         * still completes the MCP handshake before waving them through - a revoked or
         * expired grant is only found out by using it, and finding out here means they get
         * the sign-in button instead of a broken assistant.
         */
        try {
          await verifyUser();
          handedOff = true;
          onConnected?.();
        } catch {
          // Reauth needed. Fall through to the sign-in form.
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load the identity MCP connection'
      );
    } finally {
      if (!handedOff) setLoading(false);
    }
  }, [fetchBinding, fetchStatus, onConnected, verifyUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = useCallback(async () => {
    setBusy('Waiting for commercetools sign-in…');
    setError('');
    try {
      const nextStatus = await connectUser();
      setStatus(nextStatus);
      await verifyUser();
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity sign-in failed');
    } finally {
      setBusy(null);
    }
  }, [connectUser, onConnected, verifyUser]);

  if (loading) {
    return (
      <Box p="400" maxWidth="900px">
        <Stack direction="column" gap="400" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      </Box>
    );
  }

  return (
    <Box p="400" maxWidth="640px" mx="auto">
      <Stack direction="column" gap="800" alignItems="center">
        <Stack direction="column" gap="200" alignItems="center">
          <Heading as="h1" textAlign="center">
            Sign in to commercetools
          </Heading>
          <Text textAlign="center">
            Connect your Merchant Center account so the assistant can use tools
            with your permissions.
          </Text>
        </Stack>

        <Card.Root variant="outlined-elevated" width="100%">
          <Stack direction="column" gap="400" alignItems="center">
            {binding && (
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
                {binding.url}
                {`\nauthorization: ${
                  status.connected
                    ? 'connected for you'
                    : 'not connected for you'
                }`}
              </Code>
            )}

            {!status.connected && (
              <Button
                variant="solid"
                colorPalette="primary"
                onPress={connect}
                isDisabled={Boolean(busy)}
                width="100%"
                maxWidth="350px"
              >
                Connect to Managed MCP server
              </Button>
            )}

            {busy && <Text color="neutral.11">{busy}</Text>}
            {error && <Text color="critical.11">{error}</Text>}
          </Stack>
        </Card.Root>
      </Stack>
    </Box>
  );
};

IdentityConnectGate.displayName = 'IdentityConnectGate';

export default IdentityConnectGate;
