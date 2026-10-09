/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed UI Part Handler
 *
 * Handles tool outputs that contain composed page data (v5.0 format with JSX code).
 * Pushes the preview data to context instead of rendering it inline.
 * Clickable to switch preview between different versions.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Button, Text } from '@commercetools/nimbus';
import { Visibility } from '@commercetools/nimbus-icons';
import type { TPageSchema, TPageSchemaV5 } from '../../../types/composed-page';
import { useOptionalComposePreviewContext } from '../../../contexts/compose-preview-context';
import { useTabbedHeaderContext } from '../../../contexts';

/**
 * v5.0 format with JSX code and multi-component structure
 */
type TComposedUiOutput = {
  uri: string;
  schema: TPageSchemaV5;
};

type ComposedUiPartHandlerProps = {
  output: TComposedUiOutput;
};

/**
 * Preview data extracted from output
 */
type TExtractedPreviewData = {
  schema: TPageSchema;
  uri: string;
  version?: number;
};

/**
 * Check if output is the current v5.0 format with JSX code.
 *
 * This is the render gate for the "UI Preview generated" button in the chat
 * transcript (see parts/index.tsx and parts/subagent-part.tsx), so the version
 * here has to track the version the router's create_composed_page tool emits.
 *
 * v4.0 outputs are deliberately rejected: their JSX targets commercetools UI Kit
 * names the renderer no longer has in scope, so offering a preview button would
 * only ever open the "please regenerate" notice.
 */
export const isComposedUiOutput = (
  output: unknown
): output is TComposedUiOutput => {
  if (!output || typeof output !== 'object') {
    return false;
  }

  const obj = output as Record<string, unknown>;

  // Check for uri starting with 'ui://'
  if (typeof obj.uri === 'string' && obj.uri.startsWith('ui://')) {
    // Check for schema with version 5.0 and components array
    if (obj.schema && typeof obj.schema === 'object') {
      const schema = obj.schema as Record<string, unknown>;
      return (
        schema.version === '5.0' &&
        Array.isArray(schema.components) &&
        schema.components.length > 0
      );
    }
  }

  return false;
};

/**
 * Extract preview data from a v5.0 output
 */
const extractPreviewData = (
  output: TComposedUiOutput
): TExtractedPreviewData | null => {
  if (!isComposedUiOutput(output)) {
    return null;
  }

  // Extract version from URI if present (e.g., ui://composed-page/orders-list/v2)
  const versionMatch = output.uri.match(/\/v(\d+)$/);
  const version = versionMatch ? parseInt(versionMatch[1], 10) : undefined;

  return {
    schema: output.schema,
    uri: output.uri,
    version,
  };
};

/**
 * Component that handles Composed UI tool outputs
 * Pushes preview data to context and renders a clickable indicator
 */
export const ComposedUiPartHandler: React.FC<ComposedUiPartHandlerProps> = ({
  output,
}) => {
  const hasSetPreviewRef = useRef(false);
  const { highlightTab } = useTabbedHeaderContext();

  // Get context if available (null when not wrapped in a provider)
  const composePreview = useOptionalComposePreviewContext();
  const setPreviewData = composePreview?.setPreviewData ?? null;

  // Extract preview data
  const previewData = extractPreviewData(output);
  // Get URI for reset tracking
  const uri = previewData?.uri || '';

  // Push to preview context when output is available (initial load)
  useEffect(() => {
    if (setPreviewData && previewData && !hasSetPreviewRef.current) {
      hasSetPreviewRef.current = true;
      setPreviewData({
        schema: previewData.schema,
        uri: previewData.uri,
      });
    }
  }, [previewData, setPreviewData]);

  // Reset ref when output changes
  useEffect(() => {
    return () => {
      hasSetPreviewRef.current = false;
    };
  }, [uri]);

  // Handle click to switch preview to this version
  const handleClick = useCallback(() => {
    if (setPreviewData && previewData) {
      setPreviewData({
        schema: previewData.schema,
        uri: previewData.uri,
      });
      highlightTab('preview');
    }
  }, [setPreviewData, previewData, highlightTab]);

  // Extract version for display
  const version = previewData?.version;

  // Render a clickable indicator with version
  //
  // `PreviewIndicator` was a hand-rolled `<button>`: a green gradient, a matching border and
  // its own hover/active transforms. As a Nimbus `Button` with `colorPalette="positive"` the
  // border, focus ring, hover and pressed states all come from the design system; the
  // gradient is kept as the one thing a recipe cannot express, but now in palette tokens
  // rather than hard-coded Material greens, so it follows the theme.
  //
  // `onPress` rather than `onClick`: Nimbus buttons route through react-aria, where `onClick`
  // still type-checks but silently bypasses the press handling (keyboard, touch, pointer
  // cancellation). Nothing here submits a form, so the explicit `type="button"` is dropped -
  // react-aria already renders that.
  return (
    <Button
      variant="outline"
      colorPalette="positive"
      size="xs"
      onPress={handleClick}
      bgGradient="to-br"
      gradientFrom="positive.3"
      gradientTo="positive.2"
      _hover={{ gradientFrom: 'positive.4', gradientTo: 'positive.3' }}
    >
      <Visibility />
      UI Preview generated
      {version !== undefined && (
        <Text as="span" fontSize="300" fontStyle="italic" color="positive.11">
          v{version}
        </Text>
      )}
    </Button>
  );
};
