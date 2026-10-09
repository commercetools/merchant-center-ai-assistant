/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { entityLinkSource } from './entity-link.source';
import { exportSource } from './export.source';
import { createToolSourceRegistry } from './registry';
import type { ToolSource } from './types';
import { visualizeSource } from './visualize.source';

export {
  ALL_TOOLS,
  createToolSourceRegistry,
  SOURCE_RESOLVE_TIMEOUT_MS,
} from './registry';
export type { ResolveOptions, ToolSourceRegistry } from './registry';
export { installRegistryProviders } from './providers';
export type {
  ImageUploader,
  MenuEntry,
  ResolvedTools,
  ToolContext,
  ToolSource,
} from './types';

/** The process-wide registry every chat turn resolves its tools from. */
export const registry = createToolSourceRegistry();

/** Registers a source with the process-wide registry (throws on a duplicate name). */
export const registerToolSource = (...sources: ToolSource[]): void => {
  registry.register(...sources);
};

// H: the three always-on built-in sources.
registerToolSource(entityLinkSource, visualizeSource, exportSource);

/*
 * Composition. A new tool source is one file plus one line here.
 *
 *   registerToolSource(imageGenerationSource);                             // H (gated by an ImageUploader, L)
 *   // registerToolSource(createCommercetoolsIdentitySource(...));         // I
 *   // registerToolSource(knowledgeSource, contentstackSource, algoliaSource, stripeSource); // J
 *   // registerToolSource(nimbusSource);                                   // K
 *   // registerToolSource(bigquerySource);                                 // L (+ setImageUploader)
 *   // registerToolSource(composedPageSource);                             // M
 */
