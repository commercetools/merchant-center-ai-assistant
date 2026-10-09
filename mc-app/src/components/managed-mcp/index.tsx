/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  Box,
  Card,
  Heading,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/auth';
import { useIsAssistantAdmin } from '../../hooks/use-assistant-admin';
import { useManagedMcpServers } from '../../hooks/use-managed-mcp';
import type { McpServer } from '../../hooks/use-managed-mcp/types';
import { useIdentityMcpConfig } from '../../hooks/use-managed-mcp/use-identity-mcp-config';
import {
  isInsufficientPermissionError,
  missingScopesFromError,
} from '../../utils/mc-api-error';
import AdminRequiredNotice from '../admin-required-notice';
import CreateOrReuseForm, {
  type ResolvedMcpServer,
} from './create-or-reuse-form';
import ManagedMcpPermissionNotice, {
  type ManagedMcpPermissionNoticeProps,
} from './permission-notice';

/**
 * Bind this project to a CommercetoolsIdentity Managed MCP Server.
 *
 * Shown by ConnectProvider when the project has no identity binding yet. Only assistant
 * administrators (the service's ADMIN_USER_IDS) get the form; everyone else gets the
 * "Administrator access required" notice, which the page also enforces itself. A Merchant
 * Center `insufficient_scope` refusal of an administrator shows the permission notice.
 * Per-user OAuth happens on the next gate (IdentityConnectGate).
 */

const ManagedMcpPage = ({ onConnected }: { onConnected?: () => void }) => {
  const { refresh } = useAuth();
  const isAssistantAdmin = useIsAssistantAdmin();
  const { fetchServers } = useManagedMcpServers();
  const { fetchBinding, saveBinding } = useIdentityMcpConfig();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState<{
    action: ManagedMcpPermissionNoticeProps['action'];
    missingScopes: string[];
  } | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [boundServerKey, setBoundServerKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAssistantAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setDenied(null);
    try {
      const binding = await fetchBinding();
      setBoundServerKey(binding?.serverKey ?? null);

      setServers(await fetchServers());
    } catch (err) {
      if (isInsufficientPermissionError(err)) {
        setDenied({
          action: 'read',
          missingScopes: missingScopesFromError(err),
        });
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load MCP Servers for this project'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [fetchBinding, fetchServers, isAssistantAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const bind = useCallback(
    async ({ serverKey, url, majorVersion }: ResolvedMcpServer) => {
      setBusy('Binding the identity MCP Server…');
      setError('');
      try {
        await saveBinding({ serverKey, url, majorVersion });
        await refresh();
        await load();
        onConnected?.();
      } catch (err) {
        if (isInsufficientPermissionError(err)) {
          setDenied({
            action: 'create',
            missingScopes: missingScopesFromError(err),
          });
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to bind the identity MCP Server'
          );
        }
      } finally {
        setBusy(null);
      }
    },
    [saveBinding, refresh, load, onConnected]
  );

  // Hooks above run unconditionally; the guard sits below them.
  if (!isAssistantAdmin) {
    return <AdminRequiredNotice context="managed-mcp" />;
  }

  if (loading) {
    return (
      <Box p="400" maxWidth="900px">
        <Stack direction="column" gap="400" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      </Box>
    );
  }

  /* An administrator the Merchant Center itself refused: say what it asked for. */
  if (denied) {
    return (
      <Box p="400" maxWidth="900px">
        <Stack direction="column" gap="800">
          <Stack direction="column" gap="200">
            <Heading as="h1">Managed MCP Server</Heading>
            <Text>
              There is no Managed MCP server defined for this environment.
            </Text>
          </Stack>
          <ManagedMcpPermissionNotice
            action={denied.action}
            missingScopes={denied.missingScopes}
          />
        </Stack>
      </Box>
    );
  }

  return (
    <Box p="400" maxWidth="900px">
      <Stack direction="column" gap="800">
        <Stack direction="column" gap="200">
          <Heading as="h1">Managed MCP Server</Heading>
          <Text>
            Bind this project to a CommercetoolsIdentity MCP Server. Each user
            logs in with their commercetools account, and the Managed MCP server
            handles access to tools based on that user&apos;s permissions.
          </Text>
        </Stack>

        {error && <Text color="critical.11">{error}</Text>}
        {busy && <Text color="neutral.11">{busy}</Text>}

        <Card.Root variant="outlined-elevated">
          <CreateOrReuseForm
            servers={servers}
            inUseServerKey={boundServerKey}
            busy={busy}
            onBusyChange={setBusy}
            error={error}
            onError={setError}
            onPermissionDenied={(missingScopes) =>
              setDenied({ action: 'create', missingScopes })
            }
            onSubmit={bind}
            authenticationMode="CommercetoolsIdentity"
            defaultNewServerKey="ai-assistant-identity"
          />
        </Card.Root>
      </Stack>
    </Box>
  );
};

ManagedMcpPage.displayName = 'ManagedMcpPage';

export default ManagedMcpPage;
