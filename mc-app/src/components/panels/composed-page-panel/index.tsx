/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { useComposedPagesContext } from '../../../contexts/composed-pages-context';
import { ComposedPagesList } from './composed-pages-list';
import {
  Alert,
  Drawer,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';

interface ComposedPagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComposedPagesPanel: React.FC<ComposedPagesPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { loading, error } = useComposedPagesContext();

  const isLoading = loading;

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
          <Drawer.Title>Composed Pages</Drawer.Title>
          <Drawer.CloseTrigger />
        </Drawer.Header>

        <Drawer.Body>
          {isLoading ? (
            <Stack
              direction="column"
              gap="400"
              alignItems="center"
              padding="800"
            >
              <LoadingSpinner />
              <Text color="neutral.11">Loading composed pages…</Text>
            </Stack>
          ) : error ? (
            <Alert.Root colorPalette="critical" variant="outlined">
              <Alert.Title>Could not load composed pages</Alert.Title>
              <Alert.Description>{error.message}</Alert.Description>
            </Alert.Root>
          ) : (
            <ComposedPagesList />
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
};

export default ComposedPagesPanel;
