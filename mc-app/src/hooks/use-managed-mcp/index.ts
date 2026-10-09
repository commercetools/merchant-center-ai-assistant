/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { MC_API_PROXY_TARGETS } from '@commercetools-frontend/constants';
import {
  actions,
  TSdkAction,
  useAsyncDispatch,
} from '@commercetools-frontend/sdk';
import { useCallback } from 'react';
import type {
  McpServer,
  McpServerDraft,
  McpServerPagedQueryResponse,
  McpServerType,
} from './types';

/**
 * Read and create commercetools Managed MCP Servers.
 *
 * Goes through the Merchant Center API's `/proxy/ctp` REST proxy, so it runs with the
 * signed-in user's own permissions - no API client is involved. The app declares
 * `view_mcp_servers` / `manage_mcp_servers` in custom-application-config.mjs (both are in the
 * app's ordinary scopes), and the user needs the matching Merchant Center permission to
 * manage MCP servers. Whether the user is an assistant administrator is a separate matter
 * (the service's ADMIN_USER_IDS).
 */

/** The only MCP Server type commercetools offers today. */
export const MCP_SERVER_TYPE = 'CommerceMCP';

/** Managed MCP major version whose tools match self-hosted commerce-mcp 4.0.0+. */
export const MCP_MAJOR_VERSION = 'v4';

/** Query predicate: only CommercetoolsIdentity servers (this app's sole mode). */
const IDENTITY_AUTH_WHERE =
  'authenticationMode%3D%22CommercetoolsIdentity%22';

export const useManagedMcpServers = () => {
  const dispatch = useAsyncDispatch<TSdkAction, unknown>();
  const projectKey = useApplicationContext((context) => context.project?.key);

  /** Every CommercetoolsIdentity MCP Server configured on this project. */
  const fetchServers = useCallback(async (): Promise<McpServer[]> => {
    const response = (await dispatch(
      actions.get({
        mcApiProxyTarget: MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM,
        uri: `/${projectKey}/mcp-servers?limit=100&where=${IDENTITY_AUTH_WHERE}`,
      })
    )) as McpServerPagedQueryResponse;

    return response?.results ?? [];
  }, [dispatch, projectKey]);

  /**
   * The catalog of tools available for this MCP Server type and major version, with
   * descriptions and read/write classification - what the create form offers.
   */
  const fetchToolCatalog = useCallback(async (): Promise<McpServerType | null> => {
    const response = (await dispatch(
      actions.get({
        mcApiProxyTarget: MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM,
        uri: `/${projectKey}/mcp-servers/types/${MCP_SERVER_TYPE}?majorVersion=${MCP_MAJOR_VERSION}`,
      })
    )) as McpServerType;

    return response ?? null;
  }, [dispatch, projectKey]);

  const createServer = useCallback(
    async (draft: McpServerDraft): Promise<McpServer> => {
      return (await dispatch(
        actions.post({
          mcApiProxyTarget: MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM,
          uri: `/${projectKey}/mcp-servers`,
          payload: draft,
        })
      )) as McpServer;
    },
    [dispatch, projectKey]
  );

  return { fetchServers, fetchToolCatalog, createServer, projectKey };
};
