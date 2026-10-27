/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request, RequestHandler } from 'express';
import {
  getRequestFlags,
  sessionVisibleFor,
} from '../middleware/feature-flags.middleware';
import { getLoadedSession } from '../middleware/load-session.middleware';
import { getServices } from '../services/registry';
import { toSessionDigestView } from '../services/session-digest.view';
import type {
  CreateSessionRequest,
  RequestFeatureFlags,
} from '../types/chat.types';
import type { AuthenticatedRequest, RequestUser } from '../types/request.types';
import { asyncHandler, fail, ok, okMessage } from '../utils/api-response';

const MAX_TITLE_CHARS = 200;
const MAX_FLAGS = 10;

export const userOf = (req: Request): RequestUser =>
  (req as AuthenticatedRequest).user;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Non-negative integer from a query value, or undefined (NaN and negatives are ignored). */
const intParam = (raw: unknown): number | undefined => {
  if (typeof raw !== 'string') return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const parseFlagsBody = (v: unknown): RequestFeatureFlags | null | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!isPlainObject(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > MAX_FLAGS) return null;
  const out: RequestFeatureFlags = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string' && typeof value !== 'boolean') return null;
    out[key] = value;
  }
  return out;
};

/** Validates a create/update title; returns an error text or undefined. */
const titleError = (title: unknown): string | undefined =>
  title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_CHARS)
    ? `title must be a string of at most ${MAX_TITLE_CHARS} characters`
    : undefined;

export const createSession: RequestHandler = asyncHandler(async (req, res) => {
  const body: Record<string, unknown> = isPlainObject(req.body) ? req.body : {};
  const badTitle = titleError(body.title);
  if (badTitle) return fail(res, 400, badTitle);
  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    return fail(res, 400, 'metadata must be an object');
  }
  const featureFlags = parseFlagsBody(body.featureFlags);
  if (featureFlags === null) {
    return fail(res, 400, 'featureFlags must be an object of strings and booleans');
  }
  const request: CreateSessionRequest = {
    title: body.title as string | undefined,
    metadata: body.metadata as Record<string, unknown> | undefined,
    featureFlags,
    userLabel: typeof body.userLabel === 'string' ? body.userLabel : undefined,
  };
  const session = await getServices().sessions.create(userOf(req), request);
  return ok(res, session, 201);
});

export const getLastSession: RequestHandler = asyncHandler(async (req, res) => {
  const session = await getServices().sessions.lastByFlags(
    userOf(req),
    getRequestFlags(res)
  );
  if (!session) return fail(res, 404, 'No session found for this user');
  return ok(res, session);
});

export const listSessions: RequestHandler = asyncHandler(async (req, res) => {
  const limitParam = intParam(req.query.limit);
  const limit = limitParam && limitParam > 0 ? limitParam : undefined;
  const items = await getServices().sessions.list(userOf(req), {
    limit,
    flags: getRequestFlags(res),
  });
  return ok(res, items);
});

export const getSession: RequestHandler = (_req, res) => {
  ok(res, getLoadedSession(res));
};

export const getDigest: RequestHandler = (req, res) => {
  const since = intParam(req.query.since) ?? 0;
  ok(res, toSessionDigestView(getLoadedSession(res), since));
};

export const updateSession: RequestHandler = asyncHandler(async (req, res) => {
  const body: Record<string, unknown> = isPlainObject(req.body) ? req.body : {};
  const badTitle = titleError(body.title);
  if (badTitle) return fail(res, 400, badTitle);
  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    return fail(res, 400, 'metadata must be an object');
  }
  // Only `title` and `metadata` are ever applied; every other key is ignored.
  const session = await getServices().sessions.update(
    getLoadedSession(res).id,
    userOf(req),
    {
      title: body.title as string | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
    }
  );
  if (!session) return fail(res, 404, 'Session not found');
  return ok(res, session);
});

export const deleteSession: RequestHandler = asyncHandler(async (req, res) => {
  const removed = await getServices().sessions.remove(
    getLoadedSession(res).id,
    userOf(req)
  );
  if (!removed) return fail(res, 404, 'Session not found');
  return okMessage(res, 'Session deleted successfully');
});

export const getMessages: RequestHandler = asyncHandler(async (req, res) => {
  const services = getServices();
  const flags = getRequestFlags(res);
  let session = getLoadedSession(res);

  // A session whose flags do not match the request falls back to the user's last session
  // that does.
  if (!sessionVisibleFor(session, flags)) {
    const last = await services.sessions.lastByFlags(userOf(req), flags);
    if (!last) return fail(res, 404, 'Session not found');
    session = last;
  }

  const messages = await services.messages.list(session.id, {
    limit: intParam(req.query.limit),
    offset: intParam(req.query.offset),
  });
  return ok(res, messages);
});
