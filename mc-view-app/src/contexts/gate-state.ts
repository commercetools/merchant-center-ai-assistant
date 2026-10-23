/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export type GateState =
  | 'loading'
  | 'unauthorized'
  | 'forbidden'
  | 'error'
  | 'no-binding'
  | 'connect'
  | 'ready';

export type GateInput = {
  /** The session bootstrap is in flight (first load only). */
  loading: boolean;
  /** Message of the failed bootstrap, `null` when it succeeded. */
  error: string | null;
  /** HTTP status of the failed bootstrap, `null` for network failures. */
  errorStatus: number | null;
  identityMcpConfigured: boolean;
  /** `null` while the identity status has not been read yet. */
  identityConnected: boolean | null;
  /** Message of the failed identity status read. */
  statusError: string | null;
};

/**
 * Which screen the panel shows, in priority order. Pure so every branch is testable.
 *
 * 401 means the Merchant Center session lapsed (sign in again); 403 means the project is
 * not the one this service is configured for; any other failure is a service problem.
 * No binding is the same screen for administrators and everyone else.
 */
export const deriveGateState = (input: GateInput): GateState => {
  if (input.loading) return 'loading';
  if (input.error !== null) {
    if (input.errorStatus === 401) return 'unauthorized';
    if (input.errorStatus === 403) return 'forbidden';
    return 'error';
  }
  if (!input.identityMcpConfigured) return 'no-binding';
  if (input.statusError !== null) return 'error';
  if (input.identityConnected === null) return 'loading';
  if (!input.identityConnected) return 'connect';
  return 'ready';
};
