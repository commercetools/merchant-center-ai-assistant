/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { KEYIN_MAX, MAX_OFFSET, PAGE } from '../limits';
import { QueryLimitError } from './errors';
import { ObjectFilter, ObjectQuery, SortField } from './types';

const PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const SORT_FIELDS: readonly SortField[] = ['createdAt', 'lastModifiedAt', 'key'];

export interface CompiledQuery {
  where: string[];
  /** Input variables: `var.<name>` query parameters. */
  vars: Record<string, string | string[]>;
  sort: string[];
  limit: number;
  offset: number;
  withTotal: boolean;
}

export function assertValidPath(path: string): string {
  if (!PATH.test(path)) throw new QueryLimitError('Invalid filter path');
  return path;
}

export function assertValidIso(iso: string): string {
  if (!ISO_UTC.test(iso) || Number.isNaN(Date.parse(iso))) {
    throw new QueryLimitError('Invalid ISO-8601 UTC timestamp in filter');
  }
  return iso;
}

/** Checks limit, offset, sort and every filter; shared by both gateways. */
export function validateQuery(q: ObjectQuery): void {
  if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > PAGE) {
    throw new QueryLimitError(`limit must be 1..${PAGE}`);
  }
  const offset = q.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new QueryLimitError(`offset must be 0..${MAX_OFFSET}`);
  }
  if (q.sort && !SORT_FIELDS.includes(q.sort.field)) {
    throw new QueryLimitError('Unsupported sort field');
  }
  if (q.sort && q.sort.dir !== 'asc' && q.sort.dir !== 'desc') {
    throw new QueryLimitError('Unsupported sort direction');
  }
  for (const f of q.filters ?? []) validateFilter(f);
}

function validateFilter(f: ObjectFilter): void {
  switch (f.kind) {
    case 'valueEquals':
      assertValidPath(f.path);
      if (typeof f.value === 'number' && !Number.isFinite(f.value)) {
        throw new QueryLimitError('Filter number must be finite');
      }
      return;
    case 'keyIn':
      if (f.keys.length < 1 || f.keys.length > KEYIN_MAX) {
        throw new QueryLimitError(`keyIn takes 1..${KEYIN_MAX} keys`);
      }
      return;
    case 'time':
      if (!['<', '<=', '>', '>='].includes(f.op)) {
        throw new QueryLimitError('Unsupported time operator');
      }
      if (f.field !== 'createdAt' && f.field !== 'lastModifiedAt') {
        throw new QueryLimitError('Unsupported time field');
      }
      assertValidIso(f.iso);
      return;
    default:
      throw new QueryLimitError('Unsupported filter');
  }
}

/** `featureFlags.customView`, n -> `value(featureFlags(customView = :v0))`. */
function valuePredicate(path: string, rhs: string): string {
  const segments = path.split('.');
  let inner = `${segments[segments.length - 1]} = ${rhs}`;
  for (let i = segments.length - 2; i >= 0; i--) inner = `${segments[i]}(${inner})`;
  return `value(${inner})`;
}

/**
 * Compiles the structured query to Custom Object query parameters. Strings and key lists
 * always travel as input variables (never inside the predicate text). Booleans and finite
 * numbers are validated and written inline, because the variable typing of numbers is not
 * documented.
 */
export function compileQuery(q: ObjectQuery): CompiledQuery {
  validateQuery(q);
  const where: string[] = [];
  const vars: Record<string, string | string[]> = {};
  let v = 0;
  let k = 0;
  for (const f of q.filters ?? []) {
    if (f.kind === 'valueEquals') {
      if (typeof f.value === 'string') {
        const name = `v${v++}`;
        vars[name] = f.value;
        where.push(valuePredicate(f.path, `:${name}`));
      } else {
        where.push(valuePredicate(f.path, String(f.value)));
      }
    } else if (f.kind === 'keyIn') {
      const name = `k${k++}`;
      vars[name] = [...f.keys];
      where.push(`key in :${name}`);
    } else {
      where.push(`${f.field} ${f.op} "${f.iso}"`);
    }
  }
  return {
    where,
    vars,
    sort: q.sort ? [`${q.sort.field} ${q.sort.dir}`] : [],
    limit: q.limit,
    offset: q.offset ?? 0,
    withTotal: q.withTotal ?? false,
  };
}
