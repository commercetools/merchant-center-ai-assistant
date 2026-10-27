/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';
import type { Log } from '../utils/log.types';

/**
 * Every agent the product knows. An agent key is also the name of the `ToolSource` that
 * provides it (so `disabledTools[key]` and the tools-menu group id are the same string).
 *
 * A key with no registered source contributes nothing: there is no code path that creates an
 * agent for a key whose source is absent or disabled. Such keys are only reported at
 * startup (`logGatedAgentKeys`).
 */
export const AGENT_KEYS = [
  'commercetools',
  'contentstack',
  'algolia',
  'stripe',
  'commercetoolsUI',
  'visualize',
  'bigquery',
  'export',
  'imageGeneration',
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const AgentKeySchema = z.enum(AGENT_KEYS);

export interface AgentMeta {
  name: string;
  description: string;
}

/** Human-readable name and one-line description of each agent key. */
export const AGENT_META: Record<AgentKey, AgentMeta> = {
  commercetools: {
    name: 'Commercetools Commerce Agent',
    description:
      'Handles products, orders, customers, carts, inventory, discounts, all commercetools operations, and API documentation lookups',
  },
  contentstack: {
    name: 'Contentstack CMS Agent',
    description: 'Handles CMS content types, entries, and content management',
  },
  algolia: {
    name: 'Algolia Search Agent',
    description: 'Handles search index operations and search configuration',
  },
  stripe: {
    name: 'Stripe Payments Agent',
    description: 'Handles payments, invoices, subscriptions, and billing',
  },
  commercetoolsUI: {
    name: 'Commercetools UI Agent',
    description:
      'Handles dashboard creation, UI components, and composed pages using the commercetools Nimbus design system',
  },
  visualize: {
    name: 'Data Visualization Agent',
    description:
      'Creates charts, graphs, and data visualizations using Google Charts',
  },
  bigquery: {
    name: 'BigQuery SQL Analytics Agent',
    description:
      'Handles SQL analytics, data aggregation, and querying BigQuery tables (get_table_info, query_aggregated_data)',
  },
  export: {
    name: 'Data Export Agent',
    description: 'Handles exporting data to downloadable files (CSV)',
  },
  imageGeneration: {
    name: 'Image Generation Agent',
    description:
      'Generates and edits images based on user descriptions and requests',
  },
};

/** The agent keys that have no registered source (yet). */
export const gatedAgentKeys = (
  registeredNames: readonly string[]
): AgentKey[] => {
  const registered = new Set(registeredNames);
  return AGENT_KEYS.filter((key) => !registered.has(key));
};

/**
 * One info line at startup: which sources are registered and which agent keys still wait for
 * their source. Returns the gated keys.
 */
export const logGatedAgentKeys = (
  registry: { list(): Array<{ name: string }> },
  log: Pick<Log, 'info'>
): AgentKey[] => {
  const names = registry.list().map((source) => source.name);
  const gated = gatedAgentKeys(names);
  log.info('tool sources registered', {
    sources: names,
    agentKeysWithoutSource: gated,
  });
  return gated;
};
