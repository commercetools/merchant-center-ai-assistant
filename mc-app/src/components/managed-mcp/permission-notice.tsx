/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Alert, Code, Stack, Text } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';

/**
 * What the Managed MCP page shows when the Merchant Center refuses an assistant
 * administrator with `insufficient_scope`.
 *
 * It is NOT the non-admin notice: a user who is not an assistant administrator gets the
 * admin-required notice instead (components/admin-required-notice). This
 * one means the Merchant Center itself, not the assistant, refused to read or create MCP
 * servers for this user, so the remedy is a Merchant Center permission someone else holds.
 */

export type ManagedMcpPermissionNoticeProps = {
  /**
   * Which request was refused - which is also what is true about the state of things.
   * `read` is the page's own load; `create` is creating or binding a server.
   */
  action: 'read' | 'create' | 'connect';
  /** Scopes the response named as missing, from `missingScopesFromError`. May be empty. */
  missingScopes?: string[];
};

const REFUSED: Record<ManagedMcpPermissionNoticeProps['action'], string> = {
  read:
    "Connecting the assistant means reading this project's MCP Servers and binding an " +
    'identity-mode server. The Merchant Center refused that for your account.',
  create:
    'The Merchant Center refused to create or bind the MCP Server for your account. ' +
    'Nothing was created or changed.',
  connect:
    'The Merchant Center refused the Managed MCP setup for your account. Nothing was ' +
    'created or changed.',
};

export const ManagedMcpPermissionNotice = ({
  action,
  missingScopes = [],
}: ManagedMcpPermissionNoticeProps) => {
  const projectKey = useApplicationContext((context) => context.project?.key);

  return (
    <Alert.Root colorPalette="warning" variant="outlined">
      <Alert.Title>
        Your Merchant Center user is not allowed to manage MCP servers in this
        project
        {projectKey ? ` (${projectKey})` : ''}
      </Alert.Title>
      <Alert.Description>
        <Stack direction="column" gap="400">
          <Text>{REFUSED[action]}</Text>
          <Text>Ask a project owner to grant it.</Text>

          {missingScopes.length > 0 && (
            <Stack direction="column" gap="100">
              <Text fontWeight="600">Scopes the Merchant Center asked for</Text>
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
                {missingScopes.join('\n')}
              </Code>
            </Stack>
          )}
        </Stack>
      </Alert.Description>
    </Alert.Root>
  );
};

ManagedMcpPermissionNotice.displayName = 'ManagedMcpPermissionNotice';

export default ManagedMcpPermissionNotice;
