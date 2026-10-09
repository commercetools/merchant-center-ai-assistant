/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Thrown when a runtime path needs a token the user has not granted (or lost). */
export class IdentityReauthRequiredError extends Error {
  constructor(
    public readonly reason: 'no-token' | 'refresh-failed' | 'redirect-returned'
  ) {
    super(`commercetools Identity re-authorization required (${reason})`);
    this.name = 'IdentityReauthRequiredError';
  }
}

/** The MCP server rejects the user because none of the configured tools is permitted. */
export class IdentityNoPermittedToolsError extends Error {
  constructor() {
    super('None of the tools of this MCP Server is permitted for this user');
    this.name = 'IdentityNoPermittedToolsError';
  }
}

const NO_PERMITTED = /no (configured )?tools? .*permitted|not permitted/i;

/** HTTP status carried by an SDK error, when there is one. */
export const statusOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const o = error as { statusCode?: unknown; status?: unknown };
  const v = o.statusCode ?? o.status;
  return typeof v === 'number' ? v : undefined;
};

/** One-line, bounded description of an MCP failure (never includes tokens). */
export const describeMcpFailure = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error).slice(0, 300);
  const status = statusOf(error);
  return `${status ? `${status} ` : ''}${error.message}`.slice(0, 300);
};

/**
 * The exact wording of the "no tool permitted" rejection is not documented: the 403 status
 * is the primary signal, the message pattern is a fallback (tighten after E2E-I-05b).
 */
export const looksLikeNoPermittedTools = (error: unknown): boolean =>
  statusOf(error) === 403 ||
  (error instanceof Error && NO_PERMITTED.test(error.message));
