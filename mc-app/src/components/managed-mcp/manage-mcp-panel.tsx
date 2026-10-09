/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  Alert,
  Button,
  Card,
  Code,
  Drawer,
  Heading,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/auth';
import { useManagedMcpServers } from '../../hooks/use-managed-mcp';
import type {
  IdentityMcpBinding,
  McpServer,
} from '../../hooks/use-managed-mcp/types';
import { useIdentityMcpConfig } from '../../hooks/use-managed-mcp/use-identity-mcp-config';
import CreateOrReuseForm, {
  type ResolvedMcpServer,
} from './create-or-reuse-form';

/**
 * Admin drawer to select/create/rebind a CommercetoolsIdentity MCP Server.
 * Opened from the chat shell's Manage MCP button — not ClientCredentials.
 */

interface ManageMcpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManageMcpPanel = ({ isOpen, onClose }: ManageMcpPanelProps) => {
  const { refresh } = useAuth();
  const { fetchServers } = useManagedMcpServers();
  const { fetchBinding, saveBinding, removeBinding } = useIdentityMcpConfig();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [servers, setServers] = useState<McpServer[]>([]);
  const [binding, setBinding] = useState<IdentityMcpBinding | null>(null);

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    try {
      const [nextBinding, nextServers] = await Promise.all([
        fetchBinding(),
        fetchServers(),
      ]);
      setBinding(nextBinding);
      setServers(nextServers);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load Managed MCP configuration'
      );
    } finally {
      setLoading(false);
    }
  }, [fetchBinding, fetchServers, isOpen]);

  useEffect(() => {
    void load();
  }, [load]);

  const bind = useCallback(
    async ({ serverKey, url, majorVersion }: ResolvedMcpServer) => {
      setBusy('Binding the identity MCP Server…');
      setError('');
      try {
        const next = await saveBinding({ serverKey, url, majorVersion });
        setBinding(next);
        await refresh();
        await load();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to bind the identity MCP Server'
        );
      } finally {
        setBusy(null);
      }
    },
    [saveBinding, refresh, load]
  );

  const handleRemove = useCallback(async () => {
    setBusy('Removing the identity binding…');
    setError('');
    try {
      await removeBinding();
      setBinding(null);
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removal failed');
    } finally {
      setBusy(null);
    }
  }, [removeBinding, refresh, onClose]);

  return (
    <Drawer.Root
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="left"
    >
      <Drawer.Content>
        <Drawer.Header>
          {/* Matches the rail's label - the drawer used to be titled "Manage MCP",
              which named the protocol rather than the thing being managed. */}
          <Drawer.Title>Connections</Drawer.Title>
          <Drawer.CloseTrigger />
        </Drawer.Header>
        <Drawer.Body>
          {loading ? (
            <Stack direction="column" gap="400" alignItems="center">
              <LoadingSpinner size="md" />
            </Stack>
          ) : (
            <Stack direction="column" gap="600">
              {/*
               * An Alert rather than a paragraph. This is the one consequence of the
               * screen that is not undoable from here: rebinding signs every user in
               * the project out of the assistant until they each reconnect, and that
               * sentence was previously indistinguishable from the instructions above
               * it.
               */}
              <Alert.Root colorPalette="info" variant="outlined">
                <Alert.Description>
                  Admin setting. Select or create a CommercetoolsIdentity MCP
                  Server for this project. Changing the server means everyone
                  reconnects their account before they can chat again.
                </Alert.Description>
              </Alert.Root>

              {binding && (
                <Card.Root variant="outlined">
                  <Stack direction="column" gap="300">
                    <Heading as="h4">Current binding</Heading>
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
                      {`\nserver: ${binding.serverKey}`}
                    </Code>
                    <Button
                      variant="outline"
                      colorPalette="critical"
                      onPress={handleRemove}
                      isDisabled={Boolean(busy)}
                    >
                      Remove project binding
                    </Button>
                  </Stack>
                </Card.Root>
              )}

              <CreateOrReuseForm
                servers={servers}
                inUseServerKey={binding?.serverKey}
                busy={busy}
                onBusyChange={setBusy}
                error={error}
                onError={setError}
                onSubmit={bind}
                authenticationMode="CommercetoolsIdentity"
                defaultNewServerKey="ai-assistant-identity"
                submitLabel={{
                  select: binding
                    ? 'Change identity server'
                    : 'Bind identity server',
                  create: 'Create and bind identity server',
                }}
              />

              {busy && <Text color="neutral.11">{busy}</Text>}
              {error && <Text color="critical.11">{error}</Text>}
            </Stack>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
};

ManageMcpPanel.displayName = 'ManageMcpPanel';

export default ManageMcpPanel;
