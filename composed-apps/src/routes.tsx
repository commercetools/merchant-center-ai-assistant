/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Switch, Route, useRouteMatch, useHistory } from 'react-router-dom';
import { Box, NimbusProvider } from '@commercetools/nimbus';
import { SuspendedRoute } from '@commercetools-frontend/application-shell';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import ComposedPageView from './components/composed-page-view';
import { AllProviders } from './contexts';
import { ComposedPagesList } from './components/composed-pages-list';

// The default View permission of the Custom Application already guards every route.
const ApplicationRoutes = () => {
  const match = useRouteMatch();
  const history = useHistory();
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  // NimbusProvider has to live inside ApplicationShell so it can read the project's data
  // locale; `loadFonts` stays off because app-kit already loads Inter. `router` is wired to
  // the react-router v5 history so Nimbus links navigate client-side.
  return (
    <NimbusProvider
      locale={dataLocale ?? 'en'}
      loadFonts={false}
      router={{ navigate: (href: string) => history.push(href) }}
    >
      <AllProviders>
        <Box padding="600">
          <Switch>
            <Route path={`${match.path}/:pageKey`}>
              <SuspendedRoute>
                {/* A relatively positioned, own-scrolling pane so a composed page scrolls
                    inside the route rather than moving the Merchant Center chrome. */}
                <Box
                  position="relative"
                  padding="400"
                  height="100%"
                  overflowY="auto"
                >
                  <ComposedPageView urlToParent={match.url} />
                </Box>
              </SuspendedRoute>
            </Route>
            <Route>
              <ComposedPagesList />
            </Route>
          </Switch>
        </Box>
      </AllProviders>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
