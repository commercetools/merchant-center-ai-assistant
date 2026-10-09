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
import ComposedPageSettings from './composed-page-settings';

// Import contexts
import {
  ComposedPageProvider,
  useComposedPageContext,
} from '../../contexts/composed-page-context';
import { ArrowBack } from '@commercetools/nimbus-icons';
import {
  Alert,
  IconButton,
  LoadingSpinner,
  Stack,
  Text,
} from '@commercetools/nimbus';

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
const ComposedPageContent = ({ urlToParent }: { urlToParent: string }) => {
  const { page, loading, error } = useComposedPageContext();
  const routeMatch = useRouteMatch<TRouteParams>();
  const { pageKey } = useParams<TRouteParams>();
  const history = useHistory();
  // Show loading while page is being fetched
  if (loading) {
    return (
      <Stack direction="column" gap="400" alignItems="center">
        <LoadingSpinner size="md" />
        <Text>Loading page...</Text>
      </Stack>
    );
  }

  // Show error if page fetch failed
  if (error) {
    return (
      <Stack direction="column" gap="400" maxWidth="100%">
        <IconButton
          aria-label="Back to main page"
          variant="ghost"
          onPress={() => history.push(urlToParent)}
          alignSelf="flex-start"
        >
          <ArrowBack />
        </IconButton>
        {/*
         * Alert.Root is a grid whose parts are placed by slot; a bare child
         * lands in whatever cell is free next. Alert.Description puts the text
         * in the content column beside the icon.
         */}
        <Alert.Root colorPalette="critical" variant="outlined">
          <Alert.Description>{error.message}</Alert.Description>
        </Alert.Root>
      </Stack>
    );
  }

  // Show not found if no page
  if (!page) {
    return (
      <Stack direction="column" gap="400" maxWidth="100%">
        <IconButton
          aria-label="Back to main page"
          variant="ghost"
          onPress={() => history.push(urlToParent)}
          alignSelf="flex-start"
        >
          <ArrowBack />
        </IconButton>
        <Alert.Root colorPalette="warning" variant="outlined">
          <Alert.Description>Page not found: {pageKey}</Alert.Description>
        </Alert.Root>
      </Stack>
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

  return (
    <ComposedPageProvider pageKey={pageKey}>
      <ComposedPageSettings urlToParent={urlToParent} />
      <ComposedPageContent urlToParent={urlToParent} />
    </ComposedPageProvider>
  );
};

ComposedPageView.displayName = 'ComposedPageView';

export default ComposedPageView;
