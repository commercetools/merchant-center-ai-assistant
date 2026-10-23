/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page Settings Component
 *
 * Displays a settings cog icon that opens a popup menu with page actions.
 * Currently supports deleting the page with a confirmation dialog.
 */

import { useCallback } from 'react';
import { useShowNotification } from '@commercetools-frontend/actions-global';
import { DOMAINS } from '@commercetools-frontend/constants';
import { useHistory } from 'react-router-dom';
import {
  ConfirmationDialog,
  useModalState,
} from '@commercetools-frontend/application-components';
import { useComposedPageContext } from '../../contexts/composed-page-context';
import { ArrowBack, Delete, Settings } from '@commercetools/nimbus-icons';
import { Box, IconButton, Menu, Stack, Text } from '@commercetools/nimbus';

// ============================================
// Component
// ============================================

const ComposedPageSettings = ({ urlToParent }: { urlToParent: string }) => {
  const { page, deletePage, deleteLoading } = useComposedPageContext();
  const history = useHistory();
  const showNotification = useShowNotification();
  const confirmationDialogState = useModalState();

  const handleDeleteClick = useCallback(() => {
    confirmationDialogState.openModal();
  }, [confirmationDialogState]);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await deletePage();
      confirmationDialogState.closeModal();
      // Navigate back to the main page after deletion
      // Remove /composed/:pageKey from the path to go back to root
      history.push(urlToParent);
    } catch {
      showNotification({
        kind: 'error',
        domain: DOMAINS.SIDE,
        text: 'Failed to delete the page. Please try again.',
      });
    }
  }, [
    deletePage,
    confirmationDialogState,
    history,
    urlToParent,
    showNotification,
  ]);

  if (!page) {
    return null;
  }

  return (
    <>
      <Box
        width="100%"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        paddingRight="400"
      >
        <IconButton
          aria-label="Back to main page"
          onPress={() => history.push(urlToParent)}
        >
          <ArrowBack />
        </IconButton>
        {/*
         * Nimbus Menu owns open state, outside-click dismissal, Escape and roving
         * focus, which replaces a local isMenuOpen boolean, two refs and a
         * `document` mousedown listener that had to be added and removed by hand.
         */}
        <Menu.Root onAction={() => handleDeleteClick()}>
          <Menu.Trigger asChild>
            <IconButton aria-label="Page settings" size="md">
              <Settings />
            </IconButton>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item id="delete">
              <Delete width="16px" height="16px" />
              Delete page
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </Box>

      <ConfirmationDialog
        title="Delete page"
        isOpen={confirmationDialogState.isModalOpen}
        onClose={confirmationDialogState.closeModal}
        onCancel={confirmationDialogState.closeModal}
        onConfirm={handleConfirmDelete}
        isPrimaryButtonDisabled={deleteLoading}
        labelPrimary={deleteLoading ? 'Deleting...' : 'Yes, delete'}
        labelSecondary="Cancel"
      >
        <Stack direction="column" gap="400">
          <Text>Are you sure you want to delete the page "{page.name}"?</Text>
          <Text color="neutral.11">This action cannot be undone.</Text>
        </Stack>
      </ConfirmationDialog>
    </>
  );
};

ComposedPageSettings.displayName = 'ComposedPageSettings';

export default ComposedPageSettings;
