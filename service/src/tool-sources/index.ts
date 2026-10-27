/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { composedPageSource } from '../composed-pages/tool-source';
import { nimbusSource } from '../nimbus';

import { bigquerySource } from '../analytics/tools/bigquery.source';
import { entityLinkSource } from './entity-link.source';
import { exportSource } from './export.source';
import { imageGenerationSource } from './image-generation.source';
import { commercetoolsToolSource } from '../identity-mcp/tool-source';
import { createToolSourceRegistry } from './registry';
import { thirdPartyToolSources } from './third-party';
import type { ToolSource } from './types';
import { visualizeSource } from './visualize.source';

export {
  ALL_TOOLS,
  createToolSourceRegistry,
  SOURCE_RESOLVE_TIMEOUT_MS,
} from './registry';
export type { ResolveOptions, ToolSourceRegistry } from './registry';
export { installRegistryProviders } from './providers';
export { getImageUploader, setImageUploader } from './image-uploader';
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

// The three always-on built-in sources, and image generation (enabled only while an
// ImageUploader is registered).
registerToolSource(
  entityLinkSource,
  visualizeSource,
  exportSource,
  imageGenerationSource
);

// The embedded Nimbus design-system documentation tools.
registerToolSource(nimbusSource);

// SQL analytics over offloaded tool results (tools are created per request).
registerToolSource(bigquerySource);
registerToolSource(...thirdPartyToolSources); // Knowledge, Contentstack, Algolia, Stripe
registerToolSource(commercetoolsToolSource);
// Composed pages (`create_composed_page`).
registerToolSource(composedPageSource);

/*
 * Composition. A new tool source is one file plus one line here.
 *
 *   // registerToolSource(createCommercetoolsIdentitySource(...));
 *   // registerToolSource(nimbusSource);
 *   // registerToolSource(bigquerySource);                                 // (+ setImageUploader)
 *   // registerToolSource(composedPageSource);
 */
