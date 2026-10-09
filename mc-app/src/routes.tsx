/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { SuspendedRoute } from '@commercetools-frontend/application-shell';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Box, NimbusProvider } from '@commercetools/nimbus';
import { Route, Switch, useHistory, useRouteMatch } from 'react-router-dom';
import ComposedPageView from './components/composed-page-view';
import NewChat from './components/new-chat';
import { AllProviders } from './contexts';

/** Root shell. */
const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <Box position="relative" height="90vh" width="100%">
    {children}
  </Box>
);

/** Padded page frame for the routed sub-pages. */
const WrappedContent = ({ children }: { children: React.ReactNode }) => (
  <Box padding="600" height="100%" overflowY="auto">
    {children}
  </Box>
);

const ApplicationRoutes = () => {
  const match = useRouteMatch();
  const history = useHistory();
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  return (
    /**
     * NimbusProvider has to live inside ApplicationShell so it can read the project's
     * data locale, and `loadFonts` must be off because app-kit already loads Inter.
     * `router` is wired to react-router v5's history so Nimbus `Link href` and
     * `Button href` navigate client-side instead of doing a full page load.
     */
    <NimbusProvider
      locale={dataLocale ?? 'en'}
      loadFonts={false}
      router={{ navigate: (href: string) => history.push(href) }}
    >
      <AllProviders>
        <AppWrapper>
          <Switch>
            {/* Q: the guarded backoffice routes (`/backoffice/:sessionId`, `/backoffice`) go here. */}
            <Route path={`${match.path}/composed/:pageKey`}>
              <SuspendedRoute>
                <WrappedContent>
                  <ComposedPageView urlToParent={match.url} />
                </WrappedContent>
              </SuspendedRoute>
            </Route>
            {/* Q: the managed MCP page route goes here if Q keeps it. */}
            <Route>
              <NewChat />
            </Route>
          </Switch>
        </AppWrapper>
      </AllProviders>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
