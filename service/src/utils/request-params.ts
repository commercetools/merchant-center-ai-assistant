/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Response } from 'express';
import type { ServiceResult } from '../types/feedback.types';
import { fail, ok } from './api-response';

/** Renders a service outcome through the shared `ok`/`fail` envelope helpers. */
export const sendResult = <T>(res: Response, result: ServiceResult<T>): void => {
  if ('data' in result) {
    ok(res, result.data, result.status);
    return;
  }
  fail(res, result.status, result.error, result.message);
};

/** Integer from a query value or body field; `undefined` for anything else (never NaN). */
export const parseIntParam = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

export const stringParam = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
