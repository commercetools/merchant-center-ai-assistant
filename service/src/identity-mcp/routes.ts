/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler, Router } from 'express';
import { registerBootstrapContributor } from '../auth/bootstrap-registry';
import { verifyMcSession } from '../middleware/mc-session.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import { canManageBinding } from './access';
import { readIdentityConnection } from './connection';
import {
  authorizeIdentityMcp,
  callbackIdentityMcp,
  deleteIdentityMcp,
  disconnectIdentityMcpUser,
  getIdentityMcp,
  getIdentityMcpStatus,
  putIdentityMcp,
  verifyIdentityMcp,
} from './controller';
import { getIdentityRuntime } from './runtime';

/**
 * Mounted at `/service/managed-mcp-identity`. `/callback` is registered first and WITHOUT
 * `verifyMcSession`: the browser comes from the authorization server and carries no forward-to
 * JWT; the route authenticates through the single-use state it claims. Binding writes need
 * `requireAdmin` (administrator access, change D).
 */
export const identityMcpRouter: Router = Router();

const authed = verifyMcSession;

/**
 * Binding writes: administrators, or every verified user while `MCP_BINDING_OPEN_TO_ALL` is
 * on. With the flag off this is exactly `requireAdmin`.
 */
export const requireBindingAccess: RequestHandler = (req, res, next) =>
  getIdentityRuntime().config.auth.mcpBindingOpenToAll
    ? next()
    : requireAdmin(req, res, next);

identityMcpRouter.get('/callback', callbackIdentityMcp);

identityMcpRouter.get('/', authed, getIdentityMcp);
identityMcpRouter.put('/', authed, requireBindingAccess, putIdentityMcp);
identityMcpRouter.delete('/', authed, requireBindingAccess, deleteIdentityMcp);
identityMcpRouter.get('/status', authed, getIdentityMcpStatus);
identityMcpRouter.post('/authorize', authed, authorizeIdentityMcp);
identityMcpRouter.post('/verify', authed, verifyIdentityMcp);
identityMcpRouter.delete('/me', authed, disconnectIdentityMcpUser);

/**
 * Adds the identity fields to the `/auth/session` bootstrap (change D registry): one binding
 * read and one token read, no decryption; `managedMcpConfigured` is the legacy alias.
 */
registerBootstrapContributor('identity-mcp', async (req) => {
  const { stores } = getIdentityRuntime();
  const c = await readIdentityConnection(stores, req.user.userId);
  return {
    identityMcpConfigured: c.configured,
    identityUserConnected: c.connected,
    managedMcpConfigured: c.configured,
    canManageMcpBinding: canManageBinding(
      req.user.isAdmin,
      getIdentityRuntime().config
    ),
  };
});
