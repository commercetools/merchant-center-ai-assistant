/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Response } from 'express';
import type { ServiceResult } from '../types/feedback.types';

/**
 * TODO(unify with change G): G defines the shared `ok`/`fail` envelope helpers. Until both
 * branches are merged, change N renders the same `{ success, data | error, message? }` shape.
 */
export const sendOk = (
  res: Response,
  status: number,
  data: unknown,
  extra: Record<string, unknown> = {}
): void => {
  res.status(status).json({ success: true, data, ...extra });
};

export const sendResult = <T>(res: Response, result: ServiceResult<T>): void => {
  if ('data' in result) {
    sendOk(res, result.status, result.data);
    return;
  }
  res.status(result.status).json({
    success: false,
    error: result.error,
    ...(result.message ? { message: result.message } : {}),
  });
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
