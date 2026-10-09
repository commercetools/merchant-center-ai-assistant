/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page View Component
 *
 * This component renders a composed page using the shared PageRenderer.
 * Data sources are now per-component (lazy loaded via ComponentDataWrapper),
 * so no page-level DataSourcesProvider is needed.
 */

import { useHistory, useParams, useRouteMatch } from 'react-router-dom';
// Import shared components
import PageRenderer from '../page-renderer';

// Import contexts
import {
  ComposedPageProvider,
  useComposedPageContext,
} from '../../contexts/composed-page-context';
import {
  Alert,
  Box,
  IconButton,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { ArrowBack } from '@commercetools/nimbus-icons';

// ============================================
// Types
// ============================================

type TRouteParams = {
  pageKey: string;
};

// ============================================
// Inner Component
// ============================================

/**
 * Inner component that renders the page content.
 * Handles loading, error, and not-found states.
 */
const ComposedPageContent = () => {
  const { page, loading, error } = useComposedPageContext();
  const routeMatch = useRouteMatch<TRouteParams>();
  const { pageKey } = useParams<TRouteParams>();
  // Show loading while page is being fetched
  if (loading) {
    return (
      <Stack direction="column" gap="400" alignItems="center">
        <LoadingSpinner />
        <Text>Loading page...</Text>
      </Stack>
    );
  }

  // Show error if page fetch failed
  if (error) {
    return (
      <Alert.Root colorPalette="critical" variant="outlined">
        <Text>{error.message}</Text>
      </Alert.Root>
    );
  }

  // Show not found if no page
  if (!page) {
    return (
      <Alert.Root colorPalette="warning" variant="outlined">
        <Text>Page not found: {pageKey}</Text>
      </Alert.Root>
    );
  }

  const { schema, key } = page;

  return (
    <PageRenderer
      schema={schema}
      resetKey={`${key}-${schema.version}`}
      routeMatch={routeMatch}
    />
  );
};

// ============================================
// Main Component
// ============================================

/**
 * Main component that wraps everything with ComposedPageProvider
 */
const ComposedPageView = ({ urlToParent }: { urlToParent: string }) => {
  const { pageKey } = useParams<TRouteParams>();
  const history = useHistory();

  return (
    <Box maxWidth="100%">
      <ComposedPageProvider pageKey={pageKey}>
        <Stack direction="column" gap="400">
          <IconButton
            aria-label="Back to main page"
            variant="ghost"
            onPress={() => history.push(urlToParent)}
            alignSelf="flex-start"
          >
            <ArrowBack />
          </IconButton>
          <ComposedPageContent />
        </Stack>
      </ComposedPageProvider>
    </Box>
  );
};

ComposedPageView.displayName = 'ComposedPageView';

export default ComposedPageView;
