/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration } from '../config';
import { logger } from './logger.utils';

/**
 * Audit lines identify people by `userId` only: never an e-mail, a display label, a comment or
 * message content. Callers pass plain scalars.
 */
type AuditValue = string | number | boolean;

export type AdminAuditFields = {
  userId: string;
  action: string;
  route: string;
  outcome: 'ok' | 'denied' | 'error';
} & Record<string, AuditValue | undefined>;

export type SubmissionAuditFields = {
  userId: string;
  feedbackId: string;
  sessionId: string;
  sessionUserId: string;
  messageCount: number;
  chunkCount: number;
  snapshotBytes: number;
  snapshotSource: string;
} & Record<string, AuditValue | undefined>;

const FORBIDDEN_KEYS = new Set([
  'comment',
  'messages',
  'content',
  'userlabel',
  'email',
  'useremail',
]);

const isTestMode = (): boolean => {
  try {
    return readConfiguration().server.nodeEnv === 'test';
  } catch {
    return false;
  }
};

/** In test mode a forbidden key or an e-mail-looking value throws, so a leak fails the build. */
const guard = (fields: Record<string, AuditValue | undefined>): void => {
  if (!isTestMode()) return;
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`audit field not allowed: ${key}`);
    }
    if (typeof value === 'string' && value.includes('@')) {
      throw new Error(`audit value looks like an e-mail address: ${key}`);
    }
  }
};

const clean = (
  fields: Record<string, AuditValue | undefined>
): Record<string, AuditValue> =>
  Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  ) as Record<string, AuditValue>;

export const auditAdminAction = (fields: AdminAuditFields): void => {
  guard(fields);
  logger.info('audit.admin_action', clean(fields));
};

export const auditSubmission = (fields: SubmissionAuditFields): void => {
  guard(fields);
  logger.info('audit.feedback_submitted', clean(fields));
};
