/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Box, Heading, Stack, Text } from '@commercetools/nimbus';
import React from 'react';
import { YourUserId } from '../your-user-id';

export type AdminRequiredContext = 'managed-mcp' | 'backoffice' | 'generic';

type Props = {
  /** Chooses the first sentence; the instruction below it is always the same. */
  context?: AdminRequiredContext;
};

const FIRST_SENTENCE: Record<AdminRequiredContext, string | null> = {
  'managed-mcp':
    'The AI Assistant has not been connected to a Managed MCP Server for this project yet, and only administrators can do that.',
  backoffice:
    'Reviewing conversations and feedback is reserved for administrators.',
  generic: null,
};

/**
 * What a non-admin sees instead of an admin-only page.
 *
 * The one place for that experience. It names no Merchant Center permission and shows no
 * e-mail address: it tells the user to ask for their user ID to be added to the service's
 * ADMIN_USER_IDS and shows that id (read-only, with Copy) so they can pass it on. It
 * replaces the page body; it is not a dialog.
 */
export const AdminRequiredNotice: React.FC<Props> = ({
  context = 'generic',
}) => (
  <Box p="400" maxWidth="900px" role="alert">
    <Stack direction="column" gap="400">
      <Heading as="h1">Administrator access required</Heading>
      {FIRST_SENTENCE[context] && <Text>{FIRST_SENTENCE[context]}</Text>}
      <Text>
        Only administrators can do this. Ask an administrator to add your user
        ID to ADMIN_USER_IDS.
      </Text>
      <YourUserId variant="footer" />
    </Stack>
  </Box>
);

AdminRequiredNotice.displayName = 'AdminRequiredNotice';

export default AdminRequiredNotice;
