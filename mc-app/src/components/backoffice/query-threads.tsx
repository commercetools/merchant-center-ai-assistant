/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useEffect, useCallback } from 'react';
import alasql from 'alasql';
import { useAdminConnector } from '../../hooks/use-admin-connector';
import { describeAdminError } from '../../utils/admin-error';
import {
  Box,
  Button,
  Code,
  FormField,
  Heading,
  LoadingSpinner,
  MultilineTextInput,
  Stack,
  Text,
  TextInput,
} from '@commercetools/nimbus';

const TABLE_NAME = 'threads';

/**
 * Query Threads: load one page of threads into an in-browser alaSQL table and run SQL over
 * it. Everything after the load happens in the browser; running a query makes no request.
 *
 * Columns: `sessionId`, `userId`, `userLabel` (unverified, display only), `title`,
 * `createdAt`, `updatedAt`, `messageCount` and `messages` (the transcript as one JSON
 * string, which keeps the table cheap to build; use `LIKE` on it).
 */
const QueryThreads: React.FC = () => {
  const { getBackofficeThreads } = useAdminConnector();

  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isTableReady, setIsTableReady] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState(
    `SELECT * FROM ${TABLE_NAME} LIMIT 10`
  );
  const [queryResult, setQueryResult] = useState<unknown[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const loadTable = useCallback(async () => {
    setIsLoading(true);
    setIsTableReady(false);
    setQueryResult(null);
    setQueryError(null);
    setLoadError(null);

    try {
      const response = await getBackofficeThreads({}, limit, offset);
      if (response.success) {
        // Drop and recreate on every load so a reload never duplicates rows.
        alasql(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
        alasql(`CREATE TABLE ${TABLE_NAME}`);
        const rows = response.data.map((thread) => ({
          sessionId: thread.sessionId,
          userId: thread.userId,
          userLabel: thread.userLabel ?? null,
          title: thread.title ?? null,
          createdAt: thread.createdAt ?? null,
          updatedAt: thread.updatedAt ?? null,
          messageCount: thread.messages.length,
          messages: JSON.stringify(thread.messages),
        }));
        alasql(`INSERT INTO ${TABLE_NAME} SELECT * FROM ?`, [rows]);
        setRowCount(rows.length);
        setIsTableReady(true);
      }
    } catch (error) {
      setLoadError(describeAdminError(error, 'Failed to load threads'));
    } finally {
      setIsLoading(false);
    }
  }, [limit, offset, getBackofficeThreads]);

  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  const handleQuery = () => {
    try {
      const result = alasql(sqlQuery) as unknown;
      setQueryResult(Array.isArray(result) ? result : [result]);
      setQueryError(null);
    } catch (e) {
      setQueryError(String(e));
      setQueryResult(null);
    }
  };

  return (
    <Stack direction="column" gap="400">
      <Heading as="h2">Query Threads</Heading>

      {/* FormField.Root associates each caption with its input. */}
      <Stack direction="row" gap="400" alignItems="flex-end">
        <FormField.Root>
          <FormField.Label>Limit</FormField.Label>
          <FormField.Input>
            <TextInput
              value={String(limit)}
              onChange={(value) => {
                const v = parseInt(value, 10);
                if (!isNaN(v) && v > 0) setLimit(v);
              }}
              placeholder="100"
            />
          </FormField.Input>
        </FormField.Root>
        <FormField.Root>
          <FormField.Label>Offset</FormField.Label>
          <FormField.Input>
            <TextInput
              value={String(offset)}
              onChange={(value) => {
                const v = parseInt(value, 10);
                if (!isNaN(v) && v >= 0) setOffset(v);
              }}
              placeholder="0"
            />
          </FormField.Input>
        </FormField.Root>
      </Stack>

      {isLoading ? (
        <Stack direction="column" gap="600" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      ) : isTableReady ? (
        <Text textStyle="sm">
          Table ready: <Code>{TABLE_NAME}</Code> ({rowCount} rows)
        </Text>
      ) : null}

      {loadError && <Text color="critical.11">{loadError}</Text>}

      {/* `isDisabled` MUST sit on FormField.Root, not on the input:
          FormField.Input clones its child with the field's own
          `isDisabled`/`isInvalid`/`isRequired`, so an `isDisabled` passed to the
          input directly is overwritten with the Root's value (here `undefined`)
          and the box would stay editable before the table is loaded. */}
      <FormField.Root isDisabled={!isTableReady}>
        <FormField.Label>SQL Query</FormField.Label>
        <FormField.Input>
          {/* MultilineTextInput's root is inline-flex with no intrinsic width,
              so it shrink-wraps without an explicit one. */}
          <MultilineTextInput
            width="100%"
            value={sqlQuery}
            onChange={setSqlQuery}
            placeholder={`SELECT * FROM ${TABLE_NAME} LIMIT 10`}
          />
        </FormField.Input>
      </FormField.Root>

      {/* alignSelf keeps the button at its intrinsic width inside the column Stack. */}
      <Button
        alignSelf="flex-start"
        variant="ghost"
        colorPalette="primary"
        onPress={handleQuery}
        isDisabled={!isTableReady || !sqlQuery.trim()}
      >
        Run Query
      </Button>

      {queryError && <Text color="critical.11">{queryError}</Text>}

      {queryResult && (
        <Box
          as="pre"
          m="0"
          maxHeight="400px"
          overflow="auto"
          p="300"
          textStyle="xs"
          fontFamily="mono"
          border="solid-25"
          borderColor="neutral.6"
          borderRadius="150"
          bg="neutral.3"
          color="neutral.12"
        >
          {JSON.stringify(queryResult, null, 2)}
        </Box>
      )}
    </Stack>
  );
};

export default QueryThreads;
