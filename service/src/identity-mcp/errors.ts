/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  describeMcpFailure as describeSharedMcpFailure,
  statusOf,
} from '../tool-sources/mcp-failure';

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

export { statusOf };

/**
 * One-line, bounded description of a failure of the project's own Managed MCP Server (status
 * and message; never includes tokens). Shared implementation: `tool-sources/mcp-failure.ts`.
 */
export const describeMcpFailure = (error: unknown): string =>
  describeSharedMcpFailure(error, { includeMessage: true });

/**
 * The exact wording of the "no tool permitted" rejection is not documented: the 403 status
 * is the primary signal, the message pattern is a fallback (tighten after E2E-I-05b).
 */
export const looksLikeNoPermittedTools = (error: unknown): boolean =>
  statusOf(error) === 403 ||
  (error instanceof Error && NO_PERMITTED.test(error.message));
