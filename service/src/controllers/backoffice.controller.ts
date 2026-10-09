/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { NextFunction, Request, Response } from 'express';
import type { BackofficeService } from '../services/backoffice.service';
import type { BackofficeFilters } from '../types/feedback.types';
import type { AuthenticatedRequest } from '../types/request.types';
import { ok } from '../utils/api-response';
import {
  parseIntParam,
  sendResult,
  stringParam,
} from '../utils/request-params';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Only these body filters exist; everything else is dropped here (labels, e-mails, ...). */
const readFilters = (body: unknown): BackofficeFilters => {
  const raw =
    typeof body === 'object' && body !== null
      ? (body as { filters?: unknown }).filters
      : undefined;
  if (typeof raw !== 'object' || raw === null) return {};
  const f = raw as Record<string, unknown>;
  const userId = stringParam(f.userId);
  const createdAtBefore = parseIntParam(f.createdAtBefore);
  const createdAtAfter = parseIntParam(f.createdAtAfter);
  return {
    ...(userId ? { userId } : {}),
    ...(createdAtBefore !== undefined ? { createdAtBefore } : {}),
    ...(createdAtAfter !== undefined ? { createdAtAfter } : {}),
  };
};

export function backofficeController(getService: () => BackofficeService) {
  /** Answers the service-computed decision; no query, header or body field is read. */
  const isAdmin: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      ok(res, { isAdmin: getService().isAdmin(user) });
    } catch (error) {
      next(error);
    }
  };

  const threads: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const page = await getService().listThreads({
        user,
        filters: readFilters(req.body),
        limit: parseIntParam(req.query.limit),
        offset: parseIntParam(req.query.offset),
        includeMessages: req.query.messages !== 'false',
      });
      ok(res, page.items, 200, { pagination: page.pagination });
    } catch (error) {
      next(error);
    }
  };

  const thread: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      sendResult(
        res,
        await getService().getThread({ user, sessionId: String(req.params.sessionId) })
      );
    } catch (error) {
      next(error);
    }
  };

  return { isAdmin, threads, thread };
}
