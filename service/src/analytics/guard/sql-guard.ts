/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { TableReferencePort } from '../bigquery/ports';
import { extractReferencedTables, normaliseRef } from './table-refs';

/** A rejection whose message is safe to show to the model. */
export class GuardRejection extends Error {
  constructor(
    message: string,
    readonly hint?: string
  ) {
    super(message);
    this.name = 'GuardRejection';
  }
}

export const ONLY_SELECT_MESSAGE =
  "Only SELECT statements over this conversation's tables are allowed.";

export const preFilter = (sql: string): string => {
  const trimmed = sql.trim();
  if (trimmed.length === 0) throw new GuardRejection('The query is empty.');
  if (trimmed.includes('\u0000')) {
    throw new GuardRejection('The query contains invalid characters.');
  }
  return trimmed;
};

export interface DryRunStatistics {
  statementType?: string;
  referencedTables?: TableReferencePort[];
}

/**
 * Judges the statistics of a dry run (the server is the authority on what a query does). The
 * statement type must be SELECT and every referenced table must be registered on the calling
 * session. `sessionTables` are full `project.dataset.table` references.
 *
 * When a dry run does not report `referencedTables` a conservative
 * identifier extractor stands in; if it cannot follow the SQL the query is rejected.
 */
export function assertSelectOverSessionTables(
  sql: string,
  stats: DryRunStatistics | undefined,
  sessionTables: string[],
  defaults: { projectId: string; datasetId: string }
): void {
  if (stats?.statementType !== 'SELECT') {
    throw new GuardRejection(
      ONLY_SELECT_MESSAGE,
      'Rewrite it as one SELECT statement that reads only the BigQuery tables created in this conversation.'
    );
  }

  const allowed = new Set(sessionTables);
  const foreign = (ref: string): GuardRejection =>
    new GuardRejection(
      `Table ${ref} is not a table of this conversation. ${ONLY_SELECT_MESSAGE}`,
      'Use only the table references listed in availableTableRefs.'
    );

  if (Array.isArray(stats.referencedTables)) {
    for (const t of stats.referencedTables) {
      const ref = `${t.projectId}.${t.datasetId}.${t.tableId}`;
      if (!allowed.has(ref)) throw foreign(ref);
    }
    return;
  }

  const { refs, unsupported } = extractReferencedTables(sql);
  if (unsupported) {
    throw new GuardRejection(
      'The tables read by this query could not be verified.',
      'Use explicit JOINs (not comma joins) and reference tables by their full table reference.'
    );
  }
  for (const raw of refs) {
    const ref = normaliseRef(raw, defaults);
    if (!ref || !allowed.has(ref)) throw foreign(raw);
  }
}
