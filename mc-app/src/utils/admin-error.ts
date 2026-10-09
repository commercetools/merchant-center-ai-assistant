/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isForwardToError } from './forward-to';

/** The stable machine-readable code the service sends with every admin refusal. */
export const ADMIN_REQUIRED_CODE = 'ADMIN_REQUIRED';

/**
 * Error thrown by the identity-MCP requests: carries the HTTP status and the service's
 * machine-readable `code`, so callers can tell an admin refusal from any other failure.
 */
export class ServiceRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ServiceRequestError';
    this.status = status;
    this.code = code;
  }
}

const codeFromBody = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const code = (parsed as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
  } catch {
    // Not JSON: no code.
  }
  return undefined;
};

/**
 * True when the service refused the call with 403 `ADMIN_REQUIRED`. The UI shows
 * "Administrator access required" for it and keeps whatever it had stored.
 */
export const isAdminRequiredError = (err: unknown): boolean => {
  if (err instanceof ServiceRequestError) {
    return err.status === 403 && err.code === ADMIN_REQUIRED_CODE;
  }
  if (isForwardToError(err)) {
    return err.status === 403 && codeFromBody(err.body) === ADMIN_REQUIRED_CODE;
  }
  return false;
};

/** The text shown for a 403 `ADMIN_REQUIRED`. */
export const ADMIN_REQUIRED_TEXT = 'Administrator access required';

/**
 * A short message for a failed admin call: the fixed "Administrator access required" for a
 * refusal, the error's own message otherwise.
 */
export const describeAdminError = (err: unknown, fallback: string): string => {
  if (isAdminRequiredError(err)) return ADMIN_REQUIRED_TEXT;
  return err instanceof Error ? err.message : fallback;
};
