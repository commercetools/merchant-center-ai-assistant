/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler } from 'express';
import { auditAdminAction } from '../middleware/require-admin.middleware';
import { getServices } from '../services/registry';
import {
  isToolCallLogsMode,
  MAX_SYSTEM_PROMPT_CHARS,
  TOOL_CALL_LOG_MODE_LIST,
} from '../services/settings.service';
import type { AuthenticatedRequest } from '../types/request.types';
import { asyncHandler, fail, ok } from '../utils/api-response';
import { logger } from '../utils/logger.utils';

/** `GET /system-prompt` (member). Empty string when unset. */
export const getSystemPrompt: RequestHandler = asyncHandler(async (_req, res) => {
  const systemPrompt = await getServices().settings.getSystemPrompt();
  return ok(res, { systemPrompt });
});

/** `PUT /system-prompt` (admin; `requireAdmin` runs before this). */
export const putSystemPrompt: RequestHandler = asyncHandler(async (req, res) => {
  const body: unknown = req.body;
  const systemPrompt =
    typeof body === 'object' && body !== null
      ? (body as { systemPrompt?: unknown }).systemPrompt
      : undefined;
  if (typeof systemPrompt !== 'string') {
    return fail(res, 400, 'systemPrompt must be a string');
  }
  if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
    return fail(
      res,
      400,
      `systemPrompt must be at most ${MAX_SYSTEM_PROMPT_CHARS} characters`
    );
  }
  const authed = req as AuthenticatedRequest;
  try {
    await getServices().settings.setSystemPrompt(systemPrompt);
  } catch (error) {
    auditAdminAction(authed, 'PUT /system-prompt', 'failed');
    throw error;
  }
  auditAdminAction(authed, 'PUT /system-prompt', 'ok');
  logger.info('System prompt updated');
  return ok(res, { systemPrompt, message: 'System Prompt updated successfully' });
});

/** `GET /tool-call-logs` (member). Defaults to `all` without writing. */
export const getToolCallLogs: RequestHandler = asyncHandler(async (_req, res) => {
  const mode = await getServices().settings.getToolCallLogs();
  return ok(res, { mode });
});

/** `PUT /tool-call-logs` (admin). */
export const putToolCallLogs: RequestHandler = asyncHandler(async (req, res) => {
  const body: unknown = req.body;
  const mode =
    typeof body === 'object' && body !== null
      ? (body as { mode?: unknown }).mode
      : undefined;
  if (!isToolCallLogsMode(mode)) {
    return fail(
      res,
      400,
      `Invalid mode. Must be one of: ${TOOL_CALL_LOG_MODE_LIST.join(', ')}`
    );
  }
  const authed = req as AuthenticatedRequest;
  try {
    await getServices().settings.setToolCallLogs(mode);
  } catch (error) {
    auditAdminAction(authed, 'PUT /tool-call-logs', 'failed');
    throw error;
  }
  auditAdminAction(authed, 'PUT /tool-call-logs', 'ok');
  logger.info(`Tool call logs mode set to ${mode}`);
  return ok(res, { mode, message: `Tool Call Logs mode set to ${mode} successfully` });
});
