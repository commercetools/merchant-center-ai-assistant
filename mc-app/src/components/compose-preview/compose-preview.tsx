/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useShowNotification } from '@commercetools-frontend/actions-global';
import {
  FormDialog,
  useModalState,
} from '@commercetools-frontend/application-components';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { DOMAINS } from '@commercetools-frontend/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';

// Import shared components
import PageRenderer from '../page-renderer';
import { AnnotateToggle, PreviewAnnotations } from '../preview-annotations';
import type { TabId } from '../shell/view-tabs';

// Import contexts and hooks
import { useComposePreviewContext } from '../../contexts/compose-preview-context';

// Import types
import {
  useComposedPagesContext,
  useTabbedHeaderContext,
} from '../../contexts';
import { isPageSchemaV5 } from '../../types/composed-page';
import { CheckCircle } from '@commercetools/nimbus-icons';
import {
  Box,
  Button,
  Flex,
  Heading,
  Stack,
  Text,
  TextInputField,
} from '@commercetools/nimbus';

/**
 * Preview content component
 * Data sources are now loaded per-component via ComponentDataWrapper
 * No need for top-level DataSourcesProvider
 */
type TPreviewContentProps = {
  onError: (hasError: boolean) => void;
};

const PreviewContent: React.FC<TPreviewContentProps> = ({ onError }) => {
  const { previewData } = useComposePreviewContext();

  if (!previewData) {
    return null;
  }

  const { schema, uri } = previewData;

  return (
    <PageRenderer
      schema={schema}
      resetKey={uri}
      onError={() => {
        onError(true);
      }}
      onRenderError={() => {
        onError(true);
      }}
    />
  );
};

type TComposePreviewProps = {
  /**
   * Prop-drilled one level from `InteractiveTabContent`, which owns the tab state.
   *
   * Sending annotations has to move the user to the conversation - the answer streams
   * there, and staying on a preview that is about to be replaced reads as nothing having
   * happened. `useTabbedHeaderContext` only draws attention to a tab; it does not select
   * one.
   */
  onTabChange: (tab: TabId) => void;
};

/**
 * Main ComposePreview component with tabs
 */
const ComposePreview: React.FC<TComposePreviewProps> = ({ onTabChange }) => {
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);

  /** The annotatable region: the rendered page, and nothing else on the screen. */
  const renderedPageRef = useRef<HTMLDivElement>(null);

  // Form state for the save dialog
  const [pageName, setPageName] = useState('');
  const [pageIcon, setPageIcon] = useState('📄');
  const [nameError, setNameError] = useState<string | null>(null);

  const saveDialogState = useModalState();

  const { previewData } = useComposePreviewContext();
  const { createPage } = useComposedPagesContext();
  const { highlightTab } = useTabbedHeaderContext();
  const showNotification = useShowNotification();
  const { user } = useApplicationContext((context) => ({
    user: context.user,
  }));

  // Reset error state when preview data changes
  const handleError = useCallback((error: boolean) => {
    setHasError(error);
  }, []);

  /*
   * A new page means the annotated elements are gone. Disarming unmounts the toolbar, which
   * is also what stops the scope guard swallowing events for a region that no longer exists.
   */
  useEffect(() => {
    setIsAnnotating(false);
  }, [previewData?.uri]);

  const handleAnnotationsSent = useCallback(() => setIsAnnotating(false), []);

  // Open the save dialog
  const handleSaveClick = useCallback(() => {
    if (!previewData || !isPageSchemaV5(previewData.schema)) {
      showNotification({
        kind: 'error',
        domain: DOMAINS.SIDE,
        text: 'Cannot save: Invalid or legacy schema format',
      });
      return;
    }

    // Pre-fill the name with the schema title if available
    setPageName(previewData.schema.title || '');
    setPageIcon('📄');
    setNameError(null);
    saveDialogState.openModal();
  }, [previewData, showNotification, saveDialogState]);

  // Handle dialog cancel
  const handleDialogCancel = useCallback(() => {
    setPageName('');
    setPageIcon('📄');
    setNameError(null);
    saveDialogState.closeModal();
  }, [saveDialogState]);

  // Handle dialog submit - actually save the page
  const handleDialogSubmit = useCallback(async () => {
    // Validate name is required
    if (!pageName.trim()) {
      setNameError('Page name is required');
      return;
    }

    if (!previewData || !isPageSchemaV5(previewData.schema)) {
      return;
    }

    setIsSaving(true);
    try {
      await createPage({
        name: pageName.trim(),
        icon: pageIcon.trim() || '📄',
        schema: previewData.schema,
        isPublished: true,
        createdBy: user?.email,
      });

      saveDialogState.closeModal();
      setPageName('');
      setPageIcon('📄');
      highlightTab('composed-page');
    } catch {
      showNotification({
        kind: 'error',
        domain: DOMAINS.SIDE,
        text: 'Failed to save page. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    pageName,
    pageIcon,
    previewData,
    createPage,
    showNotification,
    user?.email,
    saveDialogState,
    highlightTab,
  ]);

  // Handle name change
  const handleNameChange = useCallback(
    (value: string) => {
      setPageName(value);
      if (nameError && value.trim()) {
        setNameError(null);
      }
    },
    [nameError]
  );

  // Handle icon change
  const handleIconChange = useCallback((value: string) => {
    setPageIcon(value);
  }, []);

  // Check if we can show the save button
  const canSave =
    previewData && !hasError && isPageSchemaV5(previewData.schema);

  if (!previewData) {
    return (
      <Flex
        direction="column"
        flex="1"
        minWidth="400px"
        width="85vw"
        marginX="auto"
      >
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          height="100%"
          textAlign="center"
          p="1000"
          color="neutral.11"
        >
          <Heading as="h3">No Preview Available</Heading>
          <Text>
            Chat with the AI to generate a UI component.
            <br />
            The preview will appear here.
          </Text>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      flex="1"
      minWidth="400px"
      width="85vw"
      marginX="auto"
    >
      {/*
       * `data-annotation-exempt` keeps this row alive while annotation is armed. The guard
       * makes everything outside the rendered page inert, and the control that turns the
       * mode off again is outside the rendered page - without the opt-out the user would
       * be locked in.
       */}
      <Flex data-annotation-exempt="" gap="200" alignItems="center">
        {canSave && (
          <Button
            variant="solid"
            colorPalette="primary"
            onPress={handleSaveClick}
            isDisabled={isSaving}
          >
            <CheckCircle /> Save to Composed Pages
          </Button>
        )}
        {!hasError && (
          <AnnotateToggle
            isSelected={isAnnotating}
            onChange={setIsAnnotating}
          />
        )}
      </Flex>

      <Box ref={renderedPageRef}>
        <PreviewContent onError={handleError} />
      </Box>

      <PreviewAnnotations
        scopeRef={renderedPageRef}
        isActive={isAnnotating}
        onTabChange={onTabChange}
        onDone={handleAnnotationsSent}
      />

      <FormDialog
        title="Save Page"
        isOpen={saveDialogState.isModalOpen}
        onClose={handleDialogCancel}
        onSecondaryButtonClick={handleDialogCancel}
        onPrimaryButtonClick={handleDialogSubmit}
        isPrimaryButtonDisabled={isSaving || !pageName.trim()}
        labelPrimary={isSaving ? 'Saving...' : 'Save'}
        labelSecondary="Cancel"
      >
        <Stack direction="column" gap="600">
          <TextInputField
            name="pageName"
            label="Page Name"
            isRequired
            isInvalid={!!nameError}
            value={pageName}
            onChange={handleNameChange}
            description="Enter a descriptive name for your page"
          />
          <TextInputField
            name="pageIcon"
            label="Icon"
            value={pageIcon}
            onChange={handleIconChange}
            description="Enter an emoji to represent your page (e.g., 📊, 📝, 🛒)"
          />
        </Stack>
      </FormDialog>
    </Flex>
  );
};

export default ComposePreview;
