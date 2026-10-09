/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { algoliaToolSource } from './algolia/source';
import { contentstackToolSource } from './contentstack/source';
import { knowledgeToolSource } from './knowledge/source';
import { stripeToolSource } from './stripe/source';
import type { ToolSource } from './types';

/**
 * Change J: the Knowledge MCP and the three optional third-party providers, in menu order
 * (commercetools of change I is 10; these are 20, 30, 40, 50). Group names are API contract
 * values (stored in `disabledTools`): `commercetools-knowledge`, `contentstack`, `algolia`,
 * `stripe`.
 */
export const thirdPartyToolSources: ToolSource[] = [
  knowledgeToolSource,
  contentstackToolSource,
  algoliaToolSource,
  stripeToolSource,
];
