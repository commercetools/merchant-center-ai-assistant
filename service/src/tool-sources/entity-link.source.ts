/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import {
  CREATE_ENTITY_LINK_TOOL,
  createEntityLinkToolFactory,
} from '../tools/entity-link.tool';
import type { ToolSource } from './types';

/**
 * Always-on `create_entity_link`. The project key comes from the verified user, never from
 * the model or the request. The usage guidance lives in the tool description.
 */
export const entityLinkSource: ToolSource = {
  name: 'entity-link',
  displayName: 'Entity links',
  description:
    'Turns commercetools entities (products, orders, customers, ...) into clickable Merchant Center links.',
  kind: 'core',
  order: 100,
  isEnabled: async () => true,
  getTools: async (ctx) => ({
    [CREATE_ENTITY_LINK_TOOL]: tool(
      createEntityLinkToolFactory(ctx.user.projectKey)
    ),
  }),
  listForMenu: async () => null,
  getPrompt: () => '',
};
