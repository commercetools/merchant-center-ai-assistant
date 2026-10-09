/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool, type Tool, type ToolExecutionOptions, type ToolSet } from 'ai';
import { z } from 'zod';
import { logger } from '../utils/logger.utils';

/**
 * `get_components`: one call for many components, replacing Nimbus MCP's `get_component`.
 *
 * WHY: `get_component(name, section?)` answers about one section of one component, so
 * building a page walks it once per component and pays a model step each time (~5.4 s
 * measured). A turn is essentially `steps x 5.4 s`; fewer steps is the only lever on turn
 * latency. The per-item work is unchanged: the same MCP calls run concurrently inside one
 * step instead of spread across many.
 *
 * HOW: this wraps the real `get_component` rather than reimplementing it, so the MCP
 * transport, its input schema and its output format stay authoritative. `get_component` is
 * REPLACED, not supplemented: leaving both would leave the habit (and its cost) intact.
 */

/** Sections `get_component` accepts, mirroring its own enum. */
const SECTIONS = [
  'overview',
  'guidelines',
  'implementation',
  'accessibility',
  'props',
] as const;

/**
 * Cap on items per call (names x sections). Not a correctness limit but a blast-radius one:
 * the model chooses these numbers and nothing stops it asking for every component at once.
 * Over the cap the call is rejected with a message that says how to split it (one step);
 * silently truncating would cost a wrong answer.
 */
export const MAX_LOOKUPS = 24;

/** Concurrency against the single child process. */
export const CONCURRENCY = 6;

const getComponentsSchema = z.object({
  names: z
    .array(z.string())
    .min(1)
    .describe(
      'Component or pattern names, e.g. ["Button", "Card", "MoneyInputField"]. Case-insensitive.'
    ),
  sections: z
    .array(z.enum(SECTIONS))
    .optional()
    .describe(
      'Sections to retrieve for every name. Omit to get metadata plus the list of available sections. Use ["props"] before writing props you have not seen.'
    ),
});

export const GET_COMPONENTS_TOOL = 'get_components';

type Lookup = { name: string; section?: (typeof SECTIONS)[number] };

/** Runs `run` over `items` with at most `limit` in flight, preserving input order. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]);
      }
    })()
  );
  await Promise.all(workers);
  return results;
};

export const createGetComponentsTool = (getComponent: Tool): Tool =>
  tool({
    description:
      'Returns detailed information about several Nimbus components or patterns in one call. ' +
      'Give every component you intend to use, together in one call, rather than one call per ' +
      'component. With names only: metadata and available sections for each. With names + ' +
      'sections: the content of those sections for each name.',
    inputSchema: getComponentsSchema,
    execute: async (
      { names, sections },
      options: ToolExecutionOptions<unknown>
    ): Promise<unknown> => {
      const single = getComponent.execute;
      if (!single) {
        return {
          error:
            'The Nimbus component documentation tool is unavailable in this session.',
        };
      }

      // De-duplicated because a model listing the components of a page repeats them, and each
      // duplicate would be a real call to the child.
      const uniqueNames = [
        ...new Set(names.map((name) => name.trim())),
      ].filter(Boolean);
      const uniqueSections = sections?.length
        ? [...new Set(sections)]
        : [undefined];
      const lookups: Lookup[] = uniqueNames.flatMap((name) =>
        uniqueSections.map((section) => ({ name, section }))
      );

      if (lookups.length > MAX_LOOKUPS) {
        return {
          error: `Too many lookups requested: ${uniqueNames.length} names x ${uniqueSections.length} sections = ${lookups.length}, limit ${MAX_LOOKUPS}.`,
          hint: `Ask for the components you need first, in groups of at most ${MAX_LOOKUPS} lookups.`,
        };
      }

      const startedAt = performance.now();
      const results = await mapWithConcurrency(
        lookups,
        CONCURRENCY,
        async (lookup) => {
          try {
            const component = await single(
              lookup.section
                ? { name: lookup.name, section: lookup.section }
                : { name: lookup.name },
              options
            );
            return { ...lookup, component };
          } catch (error) {
            // One unknown component name must not lose the other nine: the failure goes
            // inline next to the successes so the model can correct just that one.
            return {
              ...lookup,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      );

      logger.info('nimbus get_components', {
        names: uniqueNames.length,
        sections: uniqueSections.filter(Boolean).length,
        lookups: lookups.length,
        failed: results.filter((result) => 'error' in result).length,
        ms: Math.round(performance.now() - startedAt),
      });

      return { components: results };
    },
  });

/**
 * Swaps `get_component` for `get_components` in a Nimbus tool set.
 *
 * Returns a NEW record and never mutates the input (the manager's generation owns it).
 * A no-op when `get_component` is absent, so a Nimbus release that renames or drops it
 * degrades to whatever the server does expose.
 */
export const withBatchedComponentLookup = (tools: ToolSet): ToolSet => {
  const single = tools.get_component;
  if (!single?.execute) {
    logger.warn(
      'nimbus get_component is not available, leaving the tool set as served'
    );
    return tools;
  }
  const rest: ToolSet = { ...tools };
  delete rest.get_component;
  return { ...rest, [GET_COMPONENTS_TOOL]: createGetComponentsTool(single) };
};
