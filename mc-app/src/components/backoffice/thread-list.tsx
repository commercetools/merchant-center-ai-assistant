/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useHistory, useRouteMatch } from 'react-router-dom';
import { useAdminConnector } from '../../hooks/use-admin-connector';
import type {
  BackofficeThread,
  BackofficeThreadsFilters,
} from '../../hooks/admin-types';
import { describeAdminError } from '../../utils/admin-error';
import {
  DataTable,
  FormField,
  Heading,
  LoadingSpinner,
  Pagination,
  Stack,
  Text,
  TextInput,
  type DataTableColumnItem,
} from '@commercetools/nimbus';
import { UserDisplay } from './user-display';

/**
 * Nimbus DataTable columns carry their own cell renderer via `accessor`.
 * The user column shows the verified user id; a display label, if any, is tagged
 * "(unverified)" (see `UserDisplay`).
 */
const columns: DataTableColumnItem<BackofficeThread>[] = [
  {
    id: 'userId',
    header: 'User',
    accessor: (item) => (
      <UserDisplay userId={item.userId} userLabel={item.userLabel} />
    ),
  },
  {
    id: 'sessionId',
    header: 'Session ID',
    accessor: (item) => (
      <Text truncate title={item.sessionId}>
        {item.sessionId}
      </Text>
    ),
  },
];

const BackofficeThreadList: React.FC = () => {
  const history = useHistory();
  const match = useRouteMatch();
  // Nimbus has no usePaginationState equivalent; track it locally.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const { getBackofficeThreads } = useAdminConnector();

  const [threads, setThreads] = useState<BackofficeThread[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state: exact match on the verified user id.
  const [filterUserId, setFilterUserId] = useState('');

  const fetchThreads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: BackofficeThreadsFilters = {};
      const userId = filterUserId.trim();
      if (userId) filters.userId = userId;

      const limit = perPage;
      const offset = (page - 1) * perPage;

      const response = await getBackofficeThreads(filters, limit, offset);

      if (response.success) {
        setThreads(response.data);
        setTotalItems(response.pagination.total);
      }
    } catch (err) {
      setThreads([]);
      setTotalItems(0);
      setError(describeAdminError(err, 'Failed to fetch threads'));
    } finally {
      setIsLoading(false);
    }
  }, [filterUserId, page, perPage, getBackofficeThreads]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // Nimbus DataTable rows need a string `id`; sessionId is the natural key.
  const rows = useMemo(
    () => threads.map((thread) => ({ ...thread, id: thread.sessionId })),
    [threads]
  );

  const handleRowClick = (row: BackofficeThread) => {
    history.push(`${match.url}/${row.sessionId}`, { thread: row });
  };

  return (
    <Stack direction="column" gap="200">
      <Heading as="h2">Backoffice - Threads</Heading>

      <Stack direction="row" gap="400">
        <FormField.Root>
          <FormField.Label>User ID</FormField.Label>
          <FormField.Input>
            <TextInput
              value={filterUserId}
              onChange={(value) => {
                setPage(1);
                setFilterUserId(value);
              }}
              placeholder="Filter by user ID"
            />
          </FormField.Input>
        </FormField.Root>
      </Stack>

      {isLoading ? (
        <Stack direction="column" gap="600" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      ) : error ? (
        <Stack direction="column" gap="100">
          <Text color="critical.11">Could not load threads</Text>
          <Text textStyle="sm" color="neutral.11">
            {error}
          </Text>
        </Stack>
      ) : (
        <>
          <DataTable<BackofficeThread>
            columns={columns}
            rows={rows}
            onRowClick={handleRowClick}
          />

          <Pagination
            currentPage={page}
            onPageChange={setPage}
            pageSize={perPage}
            onPageSizeChange={setPerPage}
            enablePageSizeSelector
            totalItems={totalItems}
          />
        </>
      )}
    </Stack>
  );
};

export default BackofficeThreadList;
