/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler } from 'express';
import { getLoadedSession } from '../middleware/load-session.middleware';
import { getServices } from '../services/registry';
import { getToolMenuProvider } from '../services/tool-menu.provider';
import {
  disabledNamesFor,
  toSessionTools,
} from '../services/tools.service';
import type {
  DisabledTools,
  GroupedSessionTools,
} from '../types/chat.types';
import { asyncHandler, fail, ok } from '../utils/api-response';
import { logger } from '../utils/logger.utils';
import { userOf } from './session.controller';

const MAX_GROUPS = 50;
const MAX_TOOLS_PER_GROUP = 1000;
const MAX_NAME_CHARS = 200;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `GET|POST /session/:sessionId/tools`: the menu, assembled from the groups of the
 * injected provider and the session's stored negative list. A tool not in the list is on.
 */
export const getSessionTools: RequestHandler = asyncHandler(async (req, res) => {
  const session = getLoadedSession(res);
  const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const groups = await getToolMenuProvider().listMenuGroups({
    user: userOf(req),
    sessionId: session.id,
    locale,
  });
  const menu: GroupedSessionTools[] = groups.map((group) => ({
    mcp: group.mcp,
    tools: toSessionTools(
      group.toolNames,
      disabledNamesFor(session.disabledTools, group.mcp),
      new Set(group.unavailableToolNames ?? [])
    ),
  }));
  return ok(res, menu);
});

type ParsedGroup = { mcp: string; off: string[] };

/** Validates the posted menu; returns the groups or an error text. */
const parseGroups = (body: unknown): ParsedGroup[] | string => {
  const tools = isObject(body) ? body.tools : undefined;
  if (!Array.isArray(tools)) return 'Tools array is required in grouped format';
  if (tools.length > MAX_GROUPS) return 'Too many tool groups';
  const groups: ParsedGroup[] = [];
  for (const group of tools) {
    if (
      !isObject(group) ||
      typeof group.mcp !== 'string' ||
      group.mcp === '' ||
      group.mcp.length > MAX_NAME_CHARS ||
      !Array.isArray(group.tools)
    ) {
      return 'Each tool group must have mcp name and tools array';
    }
    if (group.tools.length > MAX_TOOLS_PER_GROUP) return 'Too many tools in a group';
    const off: string[] = [];
    for (const tool of group.tools) {
      if (
        !isObject(tool) ||
        typeof tool.toolName !== 'string' ||
        tool.toolName === '' ||
        tool.toolName.length > MAX_NAME_CHARS ||
        typeof tool.enabled !== 'boolean'
      ) {
        return 'Each tool must have a toolName and a boolean enabled';
      }
      if (!tool.enabled) off.push(tool.toolName);
    }
    groups.push({ mcp: group.mcp, off });
  }
  return groups;
};

/**
 * `PUT /session/:sessionId/tools`: stores the tools that are switched OFF. A group the body
 * does not mention is left untouched; a group with nothing off loses its key.
 */
export const updateSessionTools: RequestHandler = asyncHandler(async (req, res) => {
  const parsed = parseGroups(req.body);
  if (typeof parsed === 'string') return fail(res, 400, parsed);

  const session = getLoadedSession(res);
  const updated = await getServices().sessions.updateDisabledTools(
    session.id,
    userOf(req),
    (current) => {
      // Built through entries so a group named `__proto__` is an ordinary own key.
      const next = new Map<string, string[]>(Object.entries(current));
      for (const group of parsed) {
        if (group.off.length > 0) next.set(group.mcp, group.off);
        else next.delete(group.mcp);
      }
      return Object.fromEntries(next) as DisabledTools;
    }
  );
  if (!updated) return fail(res, 404, 'Session not found');

  logger.info(
    `Session ${session.id}: tools switched off in ${
      Object.keys(updated.disabledTools ?? {}).length
    } group(s)`
  );
  return ok(res, (req.body as { tools: unknown }).tools);
});
