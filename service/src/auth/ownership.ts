/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestUser } from '../types/request.types';

/**
 * A session is owned by exactly one verified user id. A session without an
 * owner belongs to nobody. Callers answer 404, not 403, for a
 * session that someone else owns, so its existence is not revealed.
 */
export const isOwner = (
  session: { userId?: string },
  user: Pick<RequestUser, 'userId'>
): boolean => Boolean(session.userId) && session.userId === user.userId;
