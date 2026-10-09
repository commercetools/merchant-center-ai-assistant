/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { FeatureFlags, RequestFeatureFlags } from '../types/chat.types';
import { LEGACY_IDENTITY_QUERY_KEYS } from '../types/request.types';

/**
 * Query parameters that are not feature flags. The legacy identity keys must never become
 * flags (or identity); `since` and `locale` belong to the digest and suggestions routes.
 */
export const RESERVED_QUERY_KEYS: ReadonlySet<string> = new Set<string>([
  ...LEGACY_IDENTITY_QUERY_KEYS,
  'limit',
  'offset',
  'since',
  'locale',
]);

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Non-reserved query parameters as flags; `'true'`/`'false'` become booleans. */
export function parseFeatureFlagsFromQuery(
  query: Request['query']
): RequestFeatureFlags | undefined {
  const flags: RequestFeatureFlags = {};
  let hasAny = false;
  for (const [key, raw] of Object.entries(query)) {
    if (RESERVED_QUERY_KEYS.has(key)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string') continue;
    flags[key] = value === 'true' ? true : value === 'false' ? false : decode(value);
    hasAny = true;
  }
  return hasAny ? flags : undefined;
}

/** Sets `res.locals.featureFlags` from the query string. */
export const featureFlagsMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.locals.featureFlags = parseFeatureFlagsFromQuery(req.query);
  next();
};

export const getRequestFlags = (res: Response): RequestFeatureFlags | undefined =>
  res.locals.featureFlags as RequestFeatureFlags | undefined;

export const hasFeatureFlagsFilter = (
  flags: RequestFeatureFlags | undefined
): flags is RequestFeatureFlags => flags != null && Object.keys(flags).length > 0;

type WithFlags = { featureFlags?: FeatureFlags | null };

/** Every requested key must equal the session's value. */
export function sessionMatchesFeatureFlagsQuery(
  session: WithFlags,
  flags: RequestFeatureFlags
): boolean {
  const have: Record<string, unknown> = { ...(session.featureFlags ?? {}) };
  return Object.entries(flags).every(([key, wanted]) => have[key] === wanted);
}

/** True when the session has no flags set. */
export function sessionHasNoFeatureFlags(session: WithFlags): boolean {
  const flags = session.featureFlags;
  return (
    flags == null ||
    Object.values(flags).every((v) => v === undefined)
  );
}

/** A request without flags sees only plain sessions; with flags only matching ones. */
export function sessionVisibleFor(
  session: WithFlags,
  flags: RequestFeatureFlags | undefined
): boolean {
  return hasFeatureFlagsFilter(flags)
    ? sessionMatchesFeatureFlagsQuery(session, flags)
    : sessionHasNoFeatureFlags(session);
}
