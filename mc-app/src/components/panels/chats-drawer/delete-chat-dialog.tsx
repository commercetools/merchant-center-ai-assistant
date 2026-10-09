/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ConfirmationDialog } from '@commercetools-frontend/application-components';
import { Text } from '@commercetools/nimbus';
import type { SessionSummary } from '../../../hooks/use-chat-service-connector/types';

type Props = {
  session: SessionSummary | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Deleting a conversation also deletes its messages and any temporary BigQuery tables it
 * created, none of which is recoverable - hence a confirmation rather than an undo toast.
 */
export const DeleteChatDialog: React.FC<Props> = ({
  session,
  isDeleting,
  onConfirm,
  onCancel,
}) => (
  <ConfirmationDialog
    title="Delete chat"
    isOpen={!!session}
    onClose={onCancel}
    onCancel={onCancel}
    onConfirm={onConfirm}
    labelPrimary={isDeleting ? 'Deleting...' : 'Delete'}
    labelSecondary="Cancel"
    isPrimaryButtonDisabled={isDeleting}
  >
    <Text>
      {`Are you sure you want to delete "${
        session?.title || 'this chat'
      }"? This action cannot be undone.`}
    </Text>
  </ConfirmationDialog>
);
