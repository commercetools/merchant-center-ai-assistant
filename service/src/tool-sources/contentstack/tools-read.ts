/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  ApiError,
  ContentTypeResponse,
  ContentTypesResponse,
  EntriesResponse,
  EntryResponse,
  GlobalFieldsResponse,
} from './types';
import type { ContentstackClient } from './client';

const PAGE_SIZE_DEFAULT = 100;
const SUMMARY_LIMIT = 10;

const appendFlag = (url: URL, name: string, on: boolean): void => {
  if (on) url.searchParams.append(name, 'true');
};

const appendValue = (url: URL, name: string, value: string): void => {
  if (value) url.searchParams.append(name, value);
};

const appendList = (url: URL, name: string, values: string[]): void => {
  if (values && values.length > 0) url.searchParams.append(name, values.join(','));
};

const appendPaging = (url: URL, skip: number, limit: number): void => {
  if (skip > 0) url.searchParams.append('skip', skip.toString());
  if (limit !== PAGE_SIZE_DEFAULT) url.searchParams.append('limit', limit.toString());
};

/** Summary text for a uid/title list: the first 10 numbered, then the full JSON. */
const formatUidTitleListing = ({
  noun,
  items,
  count,
  data,
}: {
  noun: string;
  items: Array<{ uid: string; title: string }>;
  count: number | undefined;
  data: unknown;
}): string => {
  const label = noun.charAt(0).toUpperCase() + noun.slice(1);
  let text = count ? `Total ${noun}: ${count}\n\n` : '';
  text += `${label} retrieved: ${items.length}\n\n`;
  if (items.length === 0) return `${text}No ${noun} found.`;

  const lines = items
    .slice(0, SUMMARY_LIMIT)
    .map((item, i) => `${i + 1}. ${item.uid} - ${item.title}\n`)
    .join('');
  // For large result sets, show a summary
  text +=
    items.length > SUMMARY_LIMIT
      ? `First ${SUMMARY_LIMIT} ${noun}:\n${lines}\n(${items.length - SUMMARY_LIMIT} more ${noun} not shown)\n\n`
      : `${label}:\n${lines}\n`;
  return `${text}Full response data:\n${JSON.stringify(data, null, 2)}`;
};

const formatEntriesListing = (
  data: EntriesResponse,
  count: number | undefined
): string => {
  let text = count ? `Total entries: ${count}\n\n` : '';
  text += `Entries retrieved: ${data.entries.length}\n\n`;
  if (data.entries.length === 0) {
    return `${text}No entries found matching the criteria.`;
  }
  // For large result sets, show a summary instead of all data
  if (data.entries.length <= SUMMARY_LIMIT) {
    return `${text}Entries:\n${JSON.stringify(data.entries, null, 2)}`;
  }
  const lines = data.entries
    .slice(0, SUMMARY_LIMIT)
    .map((entry, i) => `${i + 1}. ${entry.uid} - ${entry.title || '[No title]'}\n`)
    .join('');
  text += `First ${SUMMARY_LIMIT} entries (showing UIDs):\n${lines}`;
  text += `\n(${data.entries.length - SUMMARY_LIMIT} more entries not shown)\n\n`;
  return `${text}Full response data:\n${JSON.stringify(data, null, 2)}`;
};

export const readTools = (c: ContentstackClient): Record<string, Tool> => ({
  get_content_type: {
    description:
      'Retrieves a specific content type by its UID, optionally including the global field schema.',
    inputSchema: z.object({
      uid: z.string().describe('Content type UID to retrieve'),
      include_global_field_schema: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include global field schemas'),
    }),
    execute: async ({
      uid,
      include_global_field_schema,
    }: {
      uid: string;
      include_global_field_schema: boolean;
    }) => {
      try {
        const url = new URL(`${c.apiBaseUrl}/content_types/${uid}`);

        // Add query parameter if needed
        if (include_global_field_schema) {
          url.searchParams.append('include_global_field_schema', 'true');
        }

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: ContentTypeResponse = await response.json();

        return {
          content: [
            {
              type: 'text',
              text: `Content type retrieved successfully:\n\n${JSON.stringify(data.content_type, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving content type: ${c.handleError(error as ApiError)}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
  get_all_content_types: {
    description:
      'Retrieves a list of all content types, with options for pagination and including additional details like global field schema and counts.',
    inputSchema: z.object({
      include_global_field_schema: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include global field schemas'),
      include_count: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include total count of content types'),
      skip: z
        .number()
        .optional()
        .default(0)
        .describe('Number of content types to skip (for pagination)'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Number of content types to return (max 100)'),
      include_branch_info: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include branch information in response'),
      include_reference_content_type_uid: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include content type UIDs in references'),
    }),
    execute: async ({
      include_global_field_schema,
      include_count,
      skip,
      limit,
      include_branch_info,
      include_reference_content_type_uid,
    }: {
      include_global_field_schema: boolean;
      include_count: boolean;
      skip: number;
      limit: number;
      include_branch_info: boolean;
      include_reference_content_type_uid: boolean;
    }) => {
      try {
        const url = new URL(`${c.apiBaseUrl}/content_types`);

        appendFlag(url, 'include_global_field_schema', include_global_field_schema);
        appendFlag(url, 'include_count', include_count);
        appendPaging(url, skip, limit);
        appendFlag(url, 'include_branch_info', include_branch_info);
        appendFlag(
          url,
          'include_reference_content_type_uid',
          include_reference_content_type_uid
        );

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: ContentTypesResponse = await response.json();

        const formattedResponse = formatUidTitleListing({
          noun: 'content types',
          items: data.content_types,
          count: include_count ? data.count : undefined,
          data,
        });

        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving content types: ${c.handleError(error as ApiError)}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
  get_entry: {
    description:
      'Retrieves a specific entry by its content type UID and entry UID, with options for locale and including references.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry_uid: z.string().describe('Entry UID to retrieve'),
      locale: z.string().optional().describe("Locale code (e.g., 'en-us')"),
      include_references: z
        .array(z.string())
        .optional()
        .describe('References to include'),
      include_reference_content_type_uid: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include content type UIDs in references'),
    }),
    execute: async ({
      content_type_uid,
      entry_uid,
      locale,
      include_references,
      include_reference_content_type_uid,
    }: {
      content_type_uid: string;
      entry_uid: string;
      locale: string;
      include_references: string[];
      include_reference_content_type_uid: boolean;
    }) => {
      try {
        const url = new URL(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}`
        );

        appendValue(url, 'locale', locale);
        appendList(url, 'include[]', include_references);
        appendFlag(
          url,
          'include_reference_content_type_uid',
          include_reference_content_type_uid
        );

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: EntryResponse = await response.json();

        return {
          content: [
            {
              type: 'text',
              text: `Entry retrieved successfully:\n\n${JSON.stringify(data.entry, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving entry: ${c.handleError(error as ApiError)}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
  get_entries: {
    description:
      'Retrieves entries for a specified content type, with extensive options for filtering, sorting, pagination, and including related data.',
    inputSchema: z.object({
      content_type_uid: z
        .string()
        .describe('Content type UID to fetch entries from'),
      locale: z.string().optional().describe("Locale code (e.g., 'en-us')"),
      query: z
        .string()
        .optional()
        .describe('Query in JSON format to filter entries'),
      include_count: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include total count of entries'),
      skip: z
        .number()
        .optional()
        .default(0)
        .describe('Number of entries to skip (for pagination)'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Number of entries to return (max 100)'),
      include_reference: z
        .array(z.string())
        .optional()
        .describe('References to include'),
      include_reference_content_type_uid: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include content type UIDs in references'),
      include_schema: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include content type schema'),
      include_global_field_schema: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include global field schema'),
      asc: z
        .string()
        .optional()
        .describe('Sort entries in ascending order by the specified field UID'),
      desc: z
        .string()
        .optional()
        .describe(
          'Sort entries in descending order by the specified field UID'
        ),
      only: z
        .array(z.string())
        .optional()
        .describe('Include only specified top-level fields in the response'),
      except: z
        .array(z.string())
        .optional()
        .describe('Exclude specified top-level fields from the response'),
      include_metadata: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include metadata in the response'),
      include_publish_details: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include publish details in the response'),
      include_owner: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include owner information in the response'),
    }),
    execute: async ({
      content_type_uid,
      locale,
      query,
      include_count,
      skip,
      limit,
      include_reference,
      include_reference_content_type_uid,
      include_schema,
      include_global_field_schema,
      asc,
      desc,
      only,
      except,
      include_metadata,
      include_publish_details,
      include_owner,
    }: {
      content_type_uid: string;
      locale: string;
      query: string;
      include_count: boolean;
      skip: number;
      limit: number;
      include_reference: string[];
      include_reference_content_type_uid: boolean;
      include_schema: boolean;
      include_global_field_schema: boolean;
      asc: string;
      desc: string;
      only: string[];
      except: string[];
      include_metadata: boolean;
      include_publish_details: boolean;
      include_owner: boolean;
    }) => {
      try {
        const url = new URL(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries`
        );

        appendValue(url, 'locale', locale);
        appendValue(url, 'query', query);
        appendFlag(url, 'include_count', include_count);
        appendPaging(url, skip, limit);
        appendList(url, 'include[]', include_reference);
        appendFlag(
          url,
          'include_reference_content_type_uid',
          include_reference_content_type_uid
        );
        appendFlag(url, 'include_schema', include_schema);
        appendFlag(url, 'include_global_field_schema', include_global_field_schema);
        appendValue(url, 'asc', asc);
        appendValue(url, 'desc', desc);
        appendList(url, 'only[BASE][]', only);
        appendList(url, 'except[BASE][]', except);
        appendFlag(url, 'include_metadata', include_metadata);
        appendFlag(url, 'include_publish_details', include_publish_details);
        appendFlag(url, 'include_owner', include_owner);

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: EntriesResponse = await response.json();

        const formattedResponse = formatEntriesListing(
          data,
          include_count ? data.count : undefined
        );

        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving entries: ${c.handleError(error as ApiError)}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
  get_all_global_fields: {
    description:
      'Retrieves a list of all global fields, with options for pagination and including branch information.',
    inputSchema: z.object({
      include_count: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include total count of global fields'),
      skip: z
        .number()
        .optional()
        .default(0)
        .describe('Number of global fields to skip (for pagination)'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Number of global fields to return (max 100)'),
      include_branch_info: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include branch information in response'),
    }),
    execute: async ({
      include_count,
      skip,
      limit,
      include_branch_info,
    }: {
      include_count: boolean;
      skip: number;
      limit: number;
      include_branch_info: boolean;
    }) => {
      try {
        const url = new URL(`${c.apiBaseUrl}/global_fields`);

        appendFlag(url, 'include_count', include_count);
        appendPaging(url, skip, limit);
        appendFlag(url, 'include_branch_info', include_branch_info);

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: GlobalFieldsResponse = await response.json();

        const formattedResponse = formatUidTitleListing({
          noun: 'global fields',
          items: data.global_fields,
          count: include_count ? data.count : undefined,
          data,
        });

        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving global fields: ${c.handleError(error as ApiError)}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
});
