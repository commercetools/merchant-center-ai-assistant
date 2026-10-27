/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminConnector } from '../../hooks/use-admin-connector';
import type { FeedbackSummary } from '../../hooks/admin-types';
import { describeAdminError } from '../../utils/admin-error';
import FeedbackDetail from './feedback-detail';
import { UserDisplay } from './user-display';
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

// Metadata-only columns. No column renders the conversation: `FeedbackSummary`
// does not carry `messages` at all, so the transcript cannot leak into the
// table even by accident. The snapshot is only ever fetched by the detail view.

const formatSubmitted = (item: FeedbackSummary): string => {
  if (item.createdAt) return new Date(item.createdAt).toLocaleString();
  if (item.createdAtIso) return new Date(item.createdAtIso).toLocaleString();
  return '-';
};

/**
 * Nimbus DataTable columns carry their own cell renderer: `accessor` is both the
 * data getter and the renderer, so the old `itemRenderer` switch is folded in here.
 * `width` is typed `number | null` (pixels) - Nimbus does not accept the CSS
 * `minmax(200px, 2fr)` the Comment column previously used.
 */
const columns: DataTableColumnItem<FeedbackSummary>[] = [
  {
    id: 'createdAt',
    header: 'Submitted',
    accessor: (item) => (
      <Text truncate title={item.createdAtIso || ''}>
        {formatSubmitted(item)}
      </Text>
    ),
  },
  {
    id: 'userId',
    header: 'User',
    accessor: (item) => (
      <UserDisplay userId={item.userId} userLabel={item.userLabel} />
    ),
  },
  {
    id: 'comment',
    header: 'Comment',
    width: 300,
    // An empty comment is a valid submission ("the whole session was bad"),
    // so render an explicit placeholder rather than a blank cell.
    accessor: (item) => (
      <Text truncate title={item.comment || ''}>
        {item.comment || '(no comment)'}
      </Text>
    ),
  },
  {
    id: 'messageCount',
    header: 'Messages',
    accessor: (item) => item.messageCount,
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

const FeedbackList: React.FC = () => {
  // Nimbus has no usePaginationState equivalent; track it locally.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const { getFeedbackEntries } = useAdminConnector();

  // Filter on the verified author user id (exact match).
  const [filterAuthorUserId, setFilterAuthorUserId] = useState('');

  const [entries, setEntries] = useState<FeedbackSummary[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  // The error is RENDERED: a 403 `ADMIN_REQUIRED` must not look like "no feedback yet".
  const [error, setError] = useState<string | null>(null);

  // This component owns the master/detail toggle. Keeping `selectedId` here
  // rather than in `backoffice-tabs.tsx` is what preserves pagination across a
  // detail round-trip - the list is never unmounted while a detail is open.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const limit = perPage;
      const offset = (page - 1) * perPage;

      const response = await getFeedbackEntries(
        limit,
        offset,
        filterAuthorUserId.trim() || undefined
      );

      if (response?.success) {
        setEntries(response.data ?? []);
        setTotalItems(response.pagination?.total ?? 0);
      } else {
        setEntries([]);
        setTotalItems(0);
        setError(
          response?.error || response?.message || 'Failed to load feedback.'
        );
      }
    } catch (err) {
      setEntries([]);
      setTotalItems(0);
      setError(describeAdminError(err, 'Failed to load feedback.'));
    } finally {
      setIsLoading(false);
    }
    // Deps are the pagination PRIMITIVES (`page` / `perPage`), not
    // the `page` / `perPage` objects - those are new references on every render
    // and would make the `useEffect` below re-fetch forever.
  }, [filterAuthorUserId, page, perPage, getFeedbackEntries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Nimbus DataTable rows need a string `id`; sessionId is the natural key.
  const rows = useMemo(
    () => entries.map((entry) => ({ ...entry, id: entry.sessionId })),
    [entries]
  );

  const handleRowClick = (row: FeedbackSummary) => {
    // Guard: without an id there is nothing to fetch, and setting `''` would
    // render a detail view stuck on "not found".
    if (row?.id) {
      setSelectedId(row.id);
    }
  };

  if (selectedId) {
    return (
      <FeedbackDetail
        feedbackId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <Stack direction="column" gap="200">
      <Heading as="h2">Backoffice - Feedback</Heading>

      <Stack direction="row" gap="400">
        <FormField.Root>
          <FormField.Label>Author user ID</FormField.Label>
          <FormField.Input>
            <TextInput
              value={filterAuthorUserId}
              onChange={(value) => {
                setPage(1);
                setFilterAuthorUserId(value);
              }}
              placeholder="Filter by author user ID"
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
          <Text color="critical.11">Could not load feedback</Text>
          <Text textStyle="sm" color="neutral.11">
            {error}
          </Text>
        </Stack>
      ) : (
        <>
          {entries.length === 0 && (
            <Text color="neutral.11">No feedback has been submitted yet.</Text>
          )}

          <DataTable<FeedbackSummary>
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

export default FeedbackList;
