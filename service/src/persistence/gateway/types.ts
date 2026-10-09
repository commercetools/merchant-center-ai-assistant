/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface StoredObject<V = unknown> {
  id: string;
  version: number;
  container: string;
  key: string;
  value: V;
  createdAt: string;
  lastModifiedAt: string;
}

export type ObjectFilter =
  | { kind: 'valueEquals'; path: string; value: string | number | boolean }
  | { kind: 'keyIn'; keys: string[] } // at most 50
  | {
      kind: 'time';
      field: 'createdAt' | 'lastModifiedAt';
      op: '<' | '<=' | '>' | '>=';
      iso: string;
    };

export type SortField = 'createdAt' | 'lastModifiedAt' | 'key';

export interface ObjectQuery {
  filters?: ObjectFilter[];
  sort?: { field: SortField; dir: 'asc' | 'desc' };
  limit: number;
  offset?: number;
  withTotal?: boolean;
}

export interface ObjectGateway {
  /** Missing object resolves to `null`. */
  get(container: string, key: string): Promise<StoredObject | null>;
  /** Create or replace. A stale `ifVersion` throws `ConflictError`. */
  put(
    container: string,
    key: string,
    value: unknown,
    o?: { ifVersion?: number }
  ): Promise<StoredObject>;
  /** Returns the deleted object, or `null` when it did not exist. */
  delete(
    container: string,
    key: string,
    o?: { ifVersion?: number }
  ): Promise<StoredObject | null>;
  query(
    container: string,
    q: ObjectQuery
  ): Promise<{ results: StoredObject[]; total?: number }>;
}
