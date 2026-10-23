/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useMemo } from 'react';
import { useHistory, useRouteMatch } from 'react-router-dom';
import {
  Alert,
  Badge,
  DataTable,
  Heading,
  Stack,
  Text,
  type DataTableColumnItem,
} from '@commercetools/nimbus';
import { useComposedPagesContext } from '../../contexts/composed-pages-context';
import type { TComposedPage } from '../../types/composed-page';

const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

/**
 * Nimbus DataTable columns carry their own cell renderer: `accessor` is both the
 * data getter and the renderer, so UI Kit's separate `itemRenderer` switch is
 * folded into the column definitions here.
 */
const columns: DataTableColumnItem<TComposedPage>[] = [
  {
    id: 'name',
    header: 'Name',
    accessor: (item) => <Text fontWeight="600">{item.name}</Text>,
  },
  {
    id: 'key',
    header: 'Key',
    accessor: (item) => (
      <Text textStyle="sm" color="neutral.11">
        {item.key}
      </Text>
    ),
  },
  {
    id: 'icon',
    header: 'Icon',
    accessor: (item) =>
      item.icon ? (
        <Text>{item.icon}</Text>
      ) : (
        <Text textStyle="sm" color="neutral.11">
          -
        </Text>
      ),
  },
  {
    id: 'isPublished',
    header: 'Status',
    accessor: (item) =>
      item.isPublished ? (
        <Badge colorPalette="primary">Published</Badge>
      ) : (
        <Badge colorPalette="neutral">Draft</Badge>
      ),
  },
  {
    id: 'createdAt',
    header: 'Created',
    accessor: (item) => (
      <Text textStyle="sm">{formatDate(item.createdAt)}</Text>
    ),
  },
  {
    id: 'updatedAt',
    header: 'Updated',
    accessor: (item) => (
      <Text textStyle="sm">{formatDate(item.updatedAt)}</Text>
    ),
  },
];

export const ComposedPagesList = () => {
  const { pages, loading, error, total, truncated } = useComposedPagesContext();
  const match = useRouteMatch();
  const history = useHistory();

  const rows = useMemo(
    () => pages.map((page) => ({ ...page, id: page.id })),
    [pages]
  );

  const handleRowClick = (row: TComposedPage) => {
    // Custom Object keys only contain [-_~.a-zA-Z0-9], so no URL encoding is needed.
    history.push(`${match.url}/${row.key}`);
  };

  if (loading) {
    return (
      <Stack direction="column" gap="400">
        <Text>Loading composed pages...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert.Root colorPalette="critical" variant="outlined">
        <Text>{error.message}</Text>
      </Alert.Root>
    );
  }

  if (pages.length === 0) {
    return (
      <Alert.Root colorPalette="info" variant="outlined">
        <Text>No composed pages yet. Ask the AI Assistant to create one.</Text>
      </Alert.Root>
    );
  }

  return (
    <Stack direction="column" gap="600">
      <Heading as="h2">Composed Pages ({total})</Heading>
      {truncated && (
        <Alert.Root colorPalette="info" variant="outlined">
          <Text>
            Only the first {pages.length} of {total} pages are listed.
          </Text>
        </Alert.Root>
      )}
      <DataTable<TComposedPage>
        columns={columns}
        rows={rows}
        allowsSorting
        onRowClick={(row) => handleRowClick(row)}
      />
    </Stack>
  );
};
