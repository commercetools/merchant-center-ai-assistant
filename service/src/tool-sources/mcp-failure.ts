/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** HTTP status carried by an SDK error, when there is one. */
export const statusOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const o = error as { statusCode?: unknown; status?: unknown };
  const v = o.statusCode ?? o.status;
  return typeof v === 'number' ? v : undefined;
};

/**
 * One-line, bounded description of an MCP failure for a log line (never a token, URL or body).
 *
 * - default: the error class and HTTP status only. The message of a third-party server may
 *   echo a URL or a header, so it is not logged.
 * - `includeMessage: true`: status and message, bounded to 300 characters. Only for servers
 *   whose messages are known to carry no secret (the project's own Managed MCP Server).
 */
export const describeMcpFailure = (
  error: unknown,
  options: { includeMessage?: boolean } = {}
): string => {
  if (options.includeMessage) {
    if (!(error instanceof Error)) return String(error).slice(0, 300);
    const status = statusOf(error);
    return `${status ? `${status} ` : ''}${error.message}`.slice(0, 300);
  }
  const cls = (error as Error | undefined)?.constructor?.name ?? 'Error';
  const status = statusOf(error);
  return status !== undefined ? `${cls} status=${status}` : cls;
};
