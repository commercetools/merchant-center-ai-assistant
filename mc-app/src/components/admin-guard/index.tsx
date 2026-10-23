/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { Suspense } from 'react';
import { useIsAssistantAdmin } from '../../hooks/use-assistant-admin';
import AdminRequiredNotice, {
  type AdminRequiredContext,
} from '../admin-required-notice';

type Props = {
  children: React.ReactNode;
  /** Which sentence the notice opens with. */
  context?: AdminRequiredContext;
};

/**
 * Route guard for admin-only pages.
 *
 * It reads only the bootstrap `isAdmin` (the service decided it from the gateway-verified
 * user id and ADMIN_USER_IDS) and makes no request: a non-admin gets the "Administrator
 * access required" notice and the admin page, with its data calls, is never mounted. The
 * service enforces the same rule on every admin route (403 `ADMIN_REQUIRED`).
 */
export const AdminGuard: React.FC<Props> = ({
  children,
  context = 'backoffice',
}) => {
  const isAdmin = useIsAssistantAdmin();
  if (!isAdmin) return <AdminRequiredNotice context={context} />;
  return <Suspense fallback={null}>{children}</Suspense>;
};

export default AdminGuard;
