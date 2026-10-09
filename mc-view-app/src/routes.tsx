/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { NimbusProvider, Text } from '@commercetools/nimbus';

// Change S replaces this placeholder with the assistant panel.
const ApplicationRoutes = () => {
  const dataLocale = useApplicationContext((context) => context.dataLocale);

  return (
    <NimbusProvider locale={dataLocale ?? 'en'} loadFonts={false}>
      <Text>AI Assistant view foundation ready</Text>
    </NimbusProvider>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
