/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSource } from '../tool-sources/types';
import {
  COMPOSED_PAGE_SOURCE_NAME,
  CREATE_COMPOSED_PAGE_TOOL,
} from './constants';
import { getCommercetoolsUIPrompt } from './prompt/commercetools-ui.prompt';
import { composedPageTool } from './tool';

/**
 * Does the `nimbus` source (change K) contribute tools this turn? Used where the merged tool
 * set is not known yet (`getTools`, the tool description): it reads the kill switch K's source
 * reads. `getPrompt` asks the merged set itself through `ctx.hasTool`.
 */
const nimbusToolsEnabled = (
  ctx: Parameters<ToolSource['getPrompt']>[0]
): boolean => ctx.config.nimbus.enabled;

/**
 * `create_composed_page` and its prompt. Order 60 (K's Nimbus source is 61). The name is the
 * agent key `commercetoolsUI`. It is not part of the custom-view selection
 * (`commercetools` + `commercetools-knowledge`), so custom-view sessions never get it.
 */
export const composedPageSource: ToolSource = {
  name: COMPOSED_PAGE_SOURCE_NAME,
  displayName: 'Page builder',
  description:
    'Creates and edits custom Merchant Center pages (dashboards, lists, forms) built with the Nimbus design system',
  kind: 'core',
  routingHints:
    'Keywords: dashboard, UI, page, create page, view, composed page, interface, widget, chart in page.',
  order: 60,
  isEnabled: async () => true,
  getTools: async (ctx) => ({
    [CREATE_COMPOSED_PAGE_TOOL]: composedPageTool({
      nimbusTools: nimbusToolsEnabled(ctx),
    }),
  }),
  listForMenu: async () => null,
  getPrompt: (ctx) =>
    getCommercetoolsUIPrompt(ctx, {
      nimbusTools: nimbusToolsEnabled(ctx),
      hasTool: ctx.hasTool,
    }),
};
