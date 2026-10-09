/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { NimbusProvider, Text } from '@commercetools/nimbus';
import { useHistory } from 'react-router-dom';

// Change R replaces this placeholder with the composed pages list and viewer.
const ApplicationRoutes = () => {
  const history = useHistory();
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  return (
    <NimbusProvider
      locale={dataLocale ?? 'en'}
      loadFonts={false}
      router={{ navigate: (href: string) => history.push(href) }}
    >
      <Text>AI Assistant Pages foundation ready</Text>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
