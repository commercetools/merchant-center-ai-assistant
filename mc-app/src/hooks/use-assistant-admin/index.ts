/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useAuth } from '../../contexts/auth';

/**
 * UX gate only. Admin = the service decided (the gateway-verified user id is in
 * ADMIN_USER_IDS) and returned `isAdmin` in POST /auth/session. Never read a Merchant
 * Center permission, localStorage, a header or a browser e-mail here. Every admin route is
 * requireAdmin on the service.
 *
 * Fails closed: false while the bootstrap is loading or failed, or when the field is absent.
 */
export const useIsAssistantAdmin = (): boolean => {
  const { isAdmin, isAuthenticated } = useAuth();
  return isAuthenticated && isAdmin === true;
};

/**
 * UX gate for the shared Managed MCP binding. The service decides (`canManageMcpBinding`:
 * an administrator, or anyone while `MCP_BINDING_OPEN_TO_ALL` is on) and enforces it on the
 * binding routes. Fails closed like {@link useIsAssistantAdmin}.
 */
export const useCanManageMcpBinding = (): boolean => {
  const { canManageMcpBinding, isAuthenticated } = useAuth();
  return isAuthenticated && canManageMcpBinding === true;
};
