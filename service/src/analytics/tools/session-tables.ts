/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getServices } from '../../services/registry';
import type { TemporaryTable } from '../../types/chat.types';
import { bigQueryTarget } from '../bigquery/ports';
import { normaliseRef } from '../guard/table-refs';

export type SessionTablesAccessor = () => Promise<TemporaryTable[]>;

/**
 * Reads the session's tables on EVERY call: tables are added during the same turn, so the
 * `ctx.session` snapshot (loaded once per request) is stale. Ownership (`userId`) is
 * enforced by `SessionService`; it is never bypassed here.
 */
export const makeSessionTables = (
  sessionId: string,
  userId: string
): SessionTablesAccessor => {
  return () =>
    getServices().sessions.getAllTemporaryTables(sessionId, {
      userId,
      projectKey: '',
      isAdmin: false,
    });
};

/** `project.dataset.table` of a model-supplied reference, or `undefined`. */
export const normaliseTableRef = (ref: string): string | undefined => {
  const t = bigQueryTarget();
  return normaliseRef(ref, { projectId: t.projectId, datasetId: t.datasetId });
};

/** The registered table a reference resolves to, if any (exact, case-sensitive). */
export const findSessionTable = (
  tables: TemporaryTable[],
  ref: string
): TemporaryTable | undefined => {
  const wanted = normaliseTableRef(ref);
  if (!wanted) return undefined;
  return tables.find((table) => normaliseTableRef(table.tableRef) === wanted);
};
