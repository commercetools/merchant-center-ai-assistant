/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * commercetools Managed MCP Server types.
 *
 * Mirrors the `McpServer` / `McpServerType` representations of the Managed MCP Servers API
 * (`/{projectKey}/mcp-servers`). Only the fields this app reads are modelled.
 * See https://docs.commercetools.com/api/projects/managed-mcp-servers
 */

export type McpServerState = 'Enabled' | 'Disabled';

export type McpServerAuthenticationMode =
  | 'ClientCredentials'
  | 'CommercetoolsIdentity';

export type LocalizedString = Record<string, string>;

export type CommerceMcpServerConfig = {
  type: 'CommerceMCP';
  majorVersion: string;
  /** Derived by commercetools from region, project key and server key. Read-only. */
  url: string;
  tools: string[];
  toolCustomizations: unknown[];
};

export type McpServer = {
  id: string;
  version: number;
  key: string;
  name?: LocalizedString;
  description?: LocalizedString;
  authenticationMode: McpServerAuthenticationMode;
  state: McpServerState;
  mcpServer: CommerceMcpServerConfig;
  createdAt: string;
  lastModifiedAt: string;
};

export type McpServerPagedQueryResponse = {
  limit: number;
  offset: number;
  count: number;
  total?: number;
  results: McpServer[];
};

export type McpServerTypeTool = {
  name: string;
  description?: string;
  /** `read` or `write`. */
  operationType?: string;
  /** Group wildcards this tool belongs to, e.g. `all`, `read_all`. */
  groups?: string[];
};

export type McpServerType = {
  type: string;
  majorVersion: string;
  tools: McpServerTypeTool[];
};

export type McpServerDraft = {
  key: string;
  name?: LocalizedString;
  description?: LocalizedString;
  state?: McpServerState;
  authenticationMode?: McpServerAuthenticationMode;
  mcpServer: {
    type: 'CommerceMCP';
    majorVersion: string;
    tools: string[];
  };
};

export type IdentityMcpBinding = {
  serverKey: string;
  url: string;
  majorVersion: string;
  authenticationMode: 'CommercetoolsIdentity';
  connectedAt: string;
  discovery?: {
    resourceMetadataUrl?: string;
    resource?: string;
    authorizationServers: string[];
    scopesSupported?: string[];
    probedAt: string;
  };
};

export type IdentityMcpStatus = {
  configured: boolean;
  connected: boolean;
  serverKey?: string;
  hasRefreshToken?: boolean;
  accessTokenExpiresAt?: string;
  scope?: string;
};

export type IdentityMcpVerification = {
  connected: boolean;
  cached: boolean;
  toolCount: number;
  toolNames: string[];
};
