/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Page Renderer Components
 *
 * Shared components for rendering composed page content.
 * Used by both ComposePreview (chat preview) and ComposedPageView (published pages).
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useHistory, useLocation, type match } from 'react-router-dom';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useShowNotification } from '@commercetools-frontend/actions-global';
import { DOMAINS } from '@commercetools-frontend/constants';

import { BabelRenderer, type TRenderError } from '../../utils/babel-renderer';
import { useGraphql } from '../../hooks/use-graphql';
import UIErrorBoundary from '../ui-error-boundary';
import {
  isPageSchemaV5,
  type TRenderData,
  type TRouteInfo,
  type TUIAction,
  type TPageSchema,
  type TPageSchemaV5,
} from '../../types/composed-page';
import { Alert, Heading, Stack, Text } from '@commercetools/nimbus';

// ============================================
// Styled Components
// ============================================

// ============================================
// Types
// ============================================

export type TPageRendererProps = {
  /** The page schema to render */
  schema: TPageSchema;
  /** Unique key for resetting error boundary */
  resetKey?: string;
  /** Route match for nested routing support */
  routeMatch?: match<{ pageKey?: string }>;
  /** Callback when an error occurs during rendering */
  onError?: (errorMessage: string) => void;
  /** Callback for handling render errors from BabelRenderer */
  onRenderError?: (error: TRenderError) => void;
  /** Additional content to render after the page (e.g., confirmation dialogs) */
  children?: React.ReactNode;
};

// ============================================
// Page Renderer Component
// ============================================

/**
 * PageRenderer - Renders a composed page schema
 *
 * This component handles:
 * - Rendering v5.0 schemas using BabelRenderer
 * - Displaying legacy version warnings for V2/V3
 * - UI action handling (navigation, mutations, notifications)
 * - Form state management
 */
const PageRenderer: React.FC<TPageRendererProps> = ({
  schema,
  resetKey,
  routeMatch,
  onError,
  onRenderError,
  children,
}) => {
  const history = useHistory();
  const location = useLocation();
  const showNotification = useShowNotification();
  const { callGraphQL } = useGraphql();
  const { project, dataLocale } = useApplicationContext((context) => ({
    project: context.project,
    dataLocale: context.dataLocale,
  }));

  // Form state for input components
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Base data state - each component manages its own data via ComponentDataWrapper
  // This provides empty initial state that components will merge with their loaded data
  const [data] = useState<Record<string, unknown>>({});
  const [dataLoading] = useState<Record<string, boolean>>({});
  const [errorStrings] = useState<Record<string, string | null>>({});

  // Refetch function - now a no-op at page level since data is per-component
  // Components handle their own refetching via dispatchUIAction
  const refetch = useCallback((_dataSourceIds?: string[]) => {
    // Per-component data loading handles this internally
    // This is kept for backwards compatibility with UI actions
  }, []);

  // Build route info for nested routing support
  // When no routeMatch is provided (e.g., in preview mode), use the current pathname
  const routeInfo: TRouteInfo = useMemo(
    () => ({
      basePath: routeMatch?.path ?? location.pathname,
      baseUrl: routeMatch?.url ?? location.pathname,
      params: (routeMatch?.params as Record<string, string>) ?? {},
      pathname: location.pathname,
      search: location.search,
    }),
    [
      routeMatch?.path,
      routeMatch?.url,
      routeMatch?.params,
      location.pathname,
      location.search,
    ]
  );

  // Build render data to pass to components
  const renderData: TRenderData = useMemo(
    () => ({
      data,
      loading: dataLoading,
      errors: errorStrings,
      formValues,
      projectKey: project?.key ?? '',
      dataLocale: dataLocale ?? 'en',
      routeInfo,
    }),
    [
      data,
      dataLoading,
      errorStrings,
      formValues,
      project?.key,
      dataLocale,
      routeInfo,
    ]
  );

  // Handle UI actions from components
  const handleUIAction = useCallback(
    async (action: TUIAction) => {
      switch (action.type) {
        case 'navigate': {
          let path = action.to;
          if (action.params) {
            Object.entries(action.params).forEach(([key, value]) => {
              path = path.replace(`:${key}`, value);
            });
          }
          history.push(path);
          break;
        }

        case 'openModal':
          break;

        case 'closeModal':
          break;

        case 'notification':
          showNotification({
            kind: action.kind,
            domain: DOMAINS.SIDE,
            text: action.message,
          });
          break;

        case 'setFormValue':
          setFormValues((prev) => ({ ...prev, [action.name]: action.value }));
          break;

        case 'refetch':
          refetch(action.dataSourceIds);
          break;

        case 'mutation': {
          try {
            const cleanedMutation = action.mutation.replace(/\s+/g, ' ').trim();
            const response = await callGraphQL(
              cleanedMutation,
              action.variables ?? {}
            );

            if (response?.errors && response.errors.length > 0) {
              const errorMessage = response.errors
                .map((e: { message: string }) => e.message)
                .join(', ');
              throw new Error(errorMessage);
            }

            showNotification({
              kind: 'success',
              domain: DOMAINS.SIDE,
              text: action.successMessage ?? 'Action completed successfully',
            });

            if (action.refetchDataSources) {
              refetch(action.refetchDataSources);
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Action failed';
            showNotification({
              kind: 'error',
              domain: DOMAINS.SIDE,
              text: action.errorMessage ?? errorMessage,
            });
          }
          break;
        }

        default:
          break;
      }
    },
    [history, showNotification, refetch, callGraphQL]
  );

  // Handle render errors from BabelRenderer
  const handleRenderError = useCallback(
    (error: TRenderError) => {
      onRenderError?.(error);
    },
    [onRenderError]
  );

  // Check if this is the current (v5.0, Nimbus) format with JSX code
  if (isPageSchemaV5(schema)) {
    return (
      <>
        <UIErrorBoundary resetKey={resetKey} onError={onError}>
          <BabelRenderer
            schema={schema as TPageSchemaV5}
            renderData={renderData}
            dispatchUIAction={handleUIAction}
            onError={handleRenderError}
          />
        </UIErrorBoundary>
        {children}
      </>
    );
  }

  // Legacy format - show warning
  const legacyVersion = schema.version || 'unknown';
  return (
    <Alert.Root colorPalette="warning" variant="outlined" marginBottom="400">
      <Alert.Title>Legacy Page Format ({legacyVersion})</Alert.Title>
      <Alert.Description>
        This page was generated against the commercetools UI Kit, which this app
        no longer renders. Ask the assistant to regenerate the page to rebuild
        it with commercetools Nimbus components (v5.0).
      </Alert.Description>
    </Alert.Root>
  );
};

// ============================================
// Legacy Warning Component (for direct use)
// ============================================

type TLegacyWarningProps = {
  version: string;
};

export const LegacyFormatWarning: React.FC<TLegacyWarningProps> = ({
  version,
}) => (
  <Alert.Root colorPalette="warning" variant="outlined">
    <Stack direction="column" gap="200">
      <Heading as="h3">Legacy Page Format ({version})</Heading>
      <Text>
        This page was generated against the commercetools UI Kit, which this app
        no longer renders. Ask the assistant to regenerate the page to rebuild
        it with commercetools Nimbus components (v5.0).
      </Text>
    </Stack>
  </Alert.Root>
);

export default PageRenderer;
