/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { NextFunction, Request, Response } from 'express';
import type { FeedbackService } from '../services/feedback.service';
import type { FeedbackSubmitBody } from '../types/feedback.types';
import type { AuthenticatedRequest } from '../types/request.types';
import { ok } from '../utils/api-response';
import {
  parseIntParam,
  sendResult,
  stringParam,
} from '../utils/request-params';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Thin: parse, call the service, render. Identity comes from `req.user` only. */
export function feedbackController(getService: () => FeedbackService) {
  const submit: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const body = (req.body ?? {}) as FeedbackSubmitBody;
      sendResult(res, await getService().submit({ user, body }));
    } catch (error) {
      next(error);
    }
  };

  const list: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const q = req.query;
      const authorUserId = stringParam(q.authorUserId);
      const createdAtBefore = parseIntParam(q.createdAtBefore);
      const createdAtAfter = parseIntParam(q.createdAtAfter);
      const page = await getService().list({
        user,
        limit: parseIntParam(q.limit),
        offset: parseIntParam(q.offset),
        filters: {
          ...(authorUserId ? { authorUserId } : {}),
          ...(createdAtBefore !== undefined ? { createdAtBefore } : {}),
          ...(createdAtAfter !== undefined ? { createdAtAfter } : {}),
        },
      });
      ok(res, page.items, 200, { pagination: page.pagination });
    } catch (error) {
      next(error);
    }
  };

  const detail: Handler = async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      sendResult(
        res,
        await getService().get({ user, feedbackId: String(req.params.feedbackId) })
      );
    } catch (error) {
      next(error);
    }
  };

  return { submit, list, detail };
}
