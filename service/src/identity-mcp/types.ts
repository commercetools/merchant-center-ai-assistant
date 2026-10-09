/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  IdentityAuthStateRecord,
  IdentityMcpBindingRecord,
  IdentityMcpClientRecord,
  IdentityMcpDiscoveryRecord,
  IdentityTokenRecord,
} from '../persistence';

/** Domain names for E's persisted shapes (epoch milliseconds everywhere). */
export type IdentityBinding = IdentityMcpBindingRecord;
export type IdentityMcpClient = IdentityMcpClientRecord;
export type IdentityMcpDiscovery = IdentityMcpDiscoveryRecord;
export type TokenRecord = IdentityTokenRecord;
export type AuthStateRecord = IdentityAuthStateRecord;

/**
 * What commercetools' dynamic client registration handed back, stored verbatim (encrypted).
 * The index signature is load-bearing: `@ai-sdk/mcp` attaches `issuer`,
 * `authorization_server` and `token_endpoint` to what it saves.
 */
export interface IdentityMcpClientSecrets {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  [key: string]: unknown;
}

/** The OAuth token set, stored verbatim (encrypted) for the same reason. */
export interface IdentityMcpTokenSecrets {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  [key: string]: unknown;
}

/** The binding as the API shows it: never contains the stored OAuth client. */
export type PublicIdentityBinding = Omit<IdentityBinding, 'client'>;
