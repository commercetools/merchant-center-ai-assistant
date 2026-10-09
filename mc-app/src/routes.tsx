/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Box, NimbusProvider, Text } from '@commercetools/nimbus';
import { useHistory } from 'react-router-dom';
import { AllProviders, useAuth } from './contexts';

/** Root shell. */
const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <Box position="relative" height="90vh" width="100%">
    {children}
  </Box>
);

const Foundation = () => {
  const { projectKey, userId, isAdmin } = useAuth();
  return (
    <Box padding="600">
      <Text>AI Assistant foundation ready</Text>
      <Text>
        Project {projectKey}, user {userId}, admin {String(isAdmin)}
      </Text>
    </Box>
  );
};

// Change P adds the chat route and change Q the guarded admin routes.
const ApplicationRoutes = () => {
  const history = useHistory();
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  return (
    <NimbusProvider
      locale={dataLocale ?? 'en'}
      loadFonts={false}
      router={{ navigate: (path: string) => history.push(path) }}
    >
      <AllProviders>
        <AppWrapper>
          <Foundation />
        </AppWrapper>
      </AllProviders>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
