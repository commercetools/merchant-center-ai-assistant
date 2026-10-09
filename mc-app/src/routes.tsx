/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { SuspendedRoute } from '@commercetools-frontend/application-shell';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Box, NimbusProvider } from '@commercetools/nimbus';
import { Route, Switch, useHistory, useRouteMatch } from 'react-router-dom';
import { lazy } from 'react';
import AdminGuard from './components/admin-guard';
import ComposedPageView from './components/composed-page-view';
import NewChat from './components/new-chat';
import { AllProviders } from './contexts';

/*
 * Lazy: the backoffice pulls in `alasql` (a SQL engine that runs in the browser, ~500 KB of
 * source) for its thread query tab. Only administrators reach these routes, so it stays out
 * of the first-paint graph for everyone else.
 */
const BackofficeTabs = lazy(
  () =>
    import(
      './components/backoffice/backoffice-tabs' /* webpackChunkName: "backoffice" */
    )
);
const BackofficeSessionDetail = lazy(
  () =>
    import(
      './components/backoffice/session-detail' /* webpackChunkName: "backoffice-session-detail" */
    )
);

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
            <Route path={`${match.path}/backoffice/:sessionId`}>
              <AdminGuard>
                <WrappedContent>
                  <BackofficeSessionDetail />
                </WrappedContent>
              </AdminGuard>
            </Route>
            <Route path={`${match.path}/backoffice`}>
              <AdminGuard>
                <WrappedContent>
                  <BackofficeTabs />
                </WrappedContent>
              </AdminGuard>
            </Route>
            <Route path={`${match.path}/composed/:pageKey`}>
              <SuspendedRoute>
                <WrappedContent>
                  <ComposedPageView urlToParent={match.url} />
                </WrappedContent>
              </SuspendedRoute>
            </Route>
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
