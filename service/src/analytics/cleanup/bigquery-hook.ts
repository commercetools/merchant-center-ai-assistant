/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { SessionCleanupHook } from '../../services/session.service';
import { logger } from '../../utils/logger.utils';
import { gcpConfigured } from '../bigquery/ports';
import { deleteTable, parseTableRef } from '../bigquery/tables';
import { CLEANUP_CONCURRENCY } from '../constants';

const sanitise = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, '_');

/** Runs `work` over `items` with at most `limit` in flight (never rejects). */
export async function forEachLimited<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (error) {
        logger.warn('Session cleanup step failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Drops the session's BigQuery tables. Only tables of the configured dataset whose id starts
 * with the sanitised session id are touched (a corrupted record cannot make this delete
 * anything else). Idempotent, bounded concurrency, never throws.
 */
export const bigqueryCleanupHook: SessionCleanupHook = async (session) => {
  try {
    const tables = session.temporaryTables ?? [];
    if (tables.length === 0 || !gcpConfigured()) return;
    const prefix = `${sanitise(session.id)}_`;

    await forEachLimited(tables, CLEANUP_CONCURRENCY, async (table) => {
      let tableId: string;
      try {
        ({ tableId } = parseTableRef(table.tableRef));
      } catch {
        logger.warn(`Skipping foreign table in session ${session.id}`);
        return;
      }
      if (!tableId.startsWith(prefix)) {
        logger.warn(`Skipping table that does not belong to session ${session.id}`);
        return;
      }
      await deleteTable(table.tableRef);
    });
  } catch (error) {
    logger.error(`BigQuery cleanup failed for session ${session.id}`, {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};
