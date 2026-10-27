/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Tool names as they appear on the wire are identifiers: `read_product_search`,
 * `commercetools-documentation-search`, `products.search`. They are what an engineer
 * debugging a trace wants and precisely not what a merchandiser reading a transcript
 * wants, so each step shows both - a sentence, and the raw call underneath it in mono.
 */

/** Subagent tools are the orchestrator delegating, not an action against any system. */
const SUBAGENT_LABELS: Record<string, string> = {
  commercetools: 'Worked with your commercetools project',
  contentstack: 'Worked with Contentstack',
  algolia: 'Worked with Algolia search',
  stripe: 'Worked with Stripe',
  commercetoolsUI: 'Built a page',
  visualize: 'Built a chart',
  bigquery: 'Queried the analytics warehouse',
  export: 'Prepared a file',
  imageGeneration: 'Generated an image',
};

/** Verbs that start a tool name, mapped to how a person would say them. */
const VERBS: Record<string, string> = {
  read: 'Looked up',
  get: 'Looked up',
  list: 'Listed',
  search: 'Searched',
  query: 'Queried',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  publish: 'Published',
  unpublish: 'Unpublished',
  validate: 'Validated',
  aggregate: 'Aggregated',
};

const humanizeWords = (value: string): string =>
  value
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();

/**
 * A readable sentence for one step, e.g. `read_product_search` -> "Looked up product
 * search". Falls back to the humanised name with no verb rather than inventing one.
 */
export const labelForTool = (toolName: string, isSubagent: boolean): string => {
  if (isSubagent && SUBAGENT_LABELS[toolName]) return SUBAGENT_LABELS[toolName];

  const words = humanizeWords(toolName);
  const [first, ...rest] = words.split(' ');
  const verb = VERBS[first];

  if (verb && rest.length > 0) return `${verb} ${rest.join(' ')}`;

  return words.charAt(0).toUpperCase() + words.slice(1);
};

const MAX_VALUE = 32;

const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > MAX_VALUE
      ? `"${value.slice(0, MAX_VALUE)}…"`
      : `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  return String(value);
};

/**
 * The mono line under a step: the call as it was actually made, with arguments summarised
 * so one long `where` clause cannot push the row off the screen.
 *
 * Capped at three arguments. The point is recognition - "yes, that is the call I expected"
 * - not reproduction; the full payload is one click away in Detailed mode.
 */
export const summarizeToolCall = (toolName: string, input: unknown): string => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return `${toolName}()`;
  }

  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, value]) => value !== undefined
  );

  if (entries.length === 0) return `${toolName}()`;

  const shown = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatValue(value)}`);

  const more = entries.length > 3 ? `, +${entries.length - 3}` : '';
  return `${toolName}(${shown.join(', ')}${more})`;
};
