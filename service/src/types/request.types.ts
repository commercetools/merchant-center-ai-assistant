/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request } from 'express';

/** Who is calling. Built only from the verified gateway token (or the dev bypass). */
export interface RequestUser {
  userId: string;
  projectKey: string;
  isAdmin: boolean;
}

/** `req.user` is set by verifyMcSession. */
export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

/** Identity-looking query keys that must never become feature flags or identity. */
export const LEGACY_IDENTITY_QUERY_KEYS = [
  'userEmail',
  'userId',
  'projectKey',
] as const;
