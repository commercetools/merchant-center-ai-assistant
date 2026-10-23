/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createDetachedContext, emptySessionFor } from '../chat/context';
import { getUserFromContext } from '../context/request-context';
import { setConnectedSourcesProvider } from '../services/connected-sources.provider';
import { getServices } from '../services/registry';
import { setToolMenuProvider } from '../services/tool-menu.provider';
import type { ToolSourceRegistry } from './registry';

/**
 * Plugs the registry into change G's two seams:
 * - the tools menu (`GET /session/:id/tools`) lists the groups of every source;
 * - the suggestions prompt learns which integration sources are connected.
 *
 * Called once from `createApp`.
 */
export const installRegistryProviders = (
  registry: ToolSourceRegistry
): void => {
  setToolMenuProvider({
    listMenuGroups: async ({ user, sessionId, locale }) => {
      const session = await getServices().sessions.get(sessionId, user);
      if (!session) return [];
      const { ctx, dispose } = createDetachedContext({ user, session, locale });
      try {
        return await registry.listMenuGroups(ctx);
      } finally {
        dispose();
      }
    },
  });

  setConnectedSourcesProvider({
    list: async () => {
      // The suggestions request runs under the verified user of the request context.
      const user = getUserFromContext();
      if (!user) return [];
      const { ctx, dispose } = createDetachedContext({
        user,
        session: emptySessionFor(user),
      });
      try {
        return await registry.listConnectedSourceNames(ctx);
      } finally {
        dispose();
      }
    },
  });
};
