/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { Stack } from '@commercetools/nimbus';
import { useRouteMatch } from 'react-router-dom';
import { useComposedPagesContext } from '../../../contexts/composed-pages-context';
import { PageRow } from './page-row';
import { PagesEmptyHint } from './pages-empty-hint';

export const ComposedPagesList = () => {
  const { pages } = useComposedPagesContext();
  const match = useRouteMatch();
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );

  if (pages.length === 0) return <PagesEmptyHint />;

  return (
    <Stack direction="column" gap="250">
      {pages.map((page) => (
        <PageRow
          key={page.id}
          to={`${match.url}/composed/${page.key}`}
          name={page.name}
          icon={page.icon}
          updatedAt={page.updatedAt}
          locale={dataLocale}
        />
      ))}
    </Stack>
  );
};
