/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useHistory } from 'react-router-dom';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { NimbusProvider } from '@commercetools/nimbus';
import { AllProviders } from './contexts';
import NewChat from './components/new-chat';

const ApplicationRoutes = () => {
  const history = useHistory();
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  /*
   * `NimbusProvider` lives inside `CustomViewShell` so it can read the project's data
   * locale, and `loadFonts` stays off because app-kit already loads Inter. `router` is
   * wired to react-router's history so Nimbus links navigate client-side: a full page load
   * would reload the Custom View iframe outside its host handshake.
   */
  return (
    <NimbusProvider
      locale={dataLocale ?? 'en'}
      loadFonts={false}
      router={{ navigate: (href: string) => history.push(href) }}
    >
      <AllProviders>
        <NewChat />
      </AllProviders>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
