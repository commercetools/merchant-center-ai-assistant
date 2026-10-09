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

        // Add query parameters if needed
        if (include_global_field_schema) {
          url.searchParams.append('include_global_field_schema', 'true');
        }

        if (include_count) {
          url.searchParams.append('include_count', 'true');
        }

        if (skip > 0) {
          url.searchParams.append('skip', skip.toString());
        }

        if (limit !== 100) {
          url.searchParams.append('limit', limit.toString());
        }

        if (include_branch_info) {
          url.searchParams.append('include_branch_info', 'true');
        }

        if (include_reference_content_type_uid) {
          url.searchParams.append('include_reference_content_type_uid', 'true');
        }

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: ContentTypesResponse = await response.json();

        // Format the response
        let formattedResponse = '';

        if (include_count && data.count) {
          formattedResponse += `Total content types: ${data.count}\n\n`;
        }

        formattedResponse += `Content types retrieved: ${data.content_types.length}\n\n`;

        if (data.content_types.length > 0) {
          // For large result sets, show a summary
          if (data.content_types.length > 10) {
            formattedResponse += 'First 10 content types:\n';
            for (let i = 0; i < 10; i++) {
              const contentType = data.content_types[i];
              formattedResponse += `${i + 1}. ${contentType.uid} - ${contentType.title}\n`;
            }
            formattedResponse += `\n(${data.content_types.length - 10} more content types not shown)\n\n`;
          } else {
            formattedResponse += 'Content types:\n';
            data.content_types.forEach((contentType, index) => {
              formattedResponse += `${index + 1}. ${contentType.uid} - ${contentType.title}\n`;
            });
            formattedResponse += '\n';
          }

          formattedResponse += `Full response data:\n${JSON.stringify(data, null, 2)}`;
        } else {
          formattedResponse += 'No content types found.';
        }

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

        // Add query parameters if provided
        if (locale) {
          url.searchParams.append('locale', locale);
        }

        if (include_references && include_references.length > 0) {
          url.searchParams.append('include[]', include_references.join(','));
        }

        if (include_reference_content_type_uid) {
          url.searchParams.append('include_reference_content_type_uid', 'true');
        }

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

        // Add query parameters if provided
        if (locale) {
          url.searchParams.append('locale', locale);
        }

        if (query) {
          url.searchParams.append('query', query);
        }

        if (include_count) {
          url.searchParams.append('include_count', 'true');
        }

        if (skip > 0) {
          url.searchParams.append('skip', skip.toString());
        }

        if (limit !== 100) {
          url.searchParams.append('limit', limit.toString());
        }

        if (include_reference && include_reference.length > 0) {
          url.searchParams.append('include[]', include_reference.join(','));
        }

        if (include_reference_content_type_uid) {
          url.searchParams.append('include_reference_content_type_uid', 'true');
        }

        if (include_schema) {
          url.searchParams.append('include_schema', 'true');
        }

        if (include_global_field_schema) {
          url.searchParams.append('include_global_field_schema', 'true');
        }

        if (asc) {
          url.searchParams.append('asc', asc);
        }

        if (desc) {
          url.searchParams.append('desc', desc);
        }

        if (only && only.length > 0) {
          url.searchParams.append('only[BASE][]', only.join(','));
        }

        if (except && except.length > 0) {
          url.searchParams.append('except[BASE][]', except.join(','));
        }

        if (include_metadata) {
          url.searchParams.append('include_metadata', 'true');
        }

        if (include_publish_details) {
          url.searchParams.append('include_publish_details', 'true');
        }

        if (include_owner) {
          url.searchParams.append('include_owner', 'true');
        }

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: EntriesResponse = await response.json();

        // Format the response
        let formattedResponse = '';

        if (include_count && data.count) {
          formattedResponse += `Total entries: ${data.count}\n\n`;
        }

        formattedResponse += `Entries retrieved: ${data.entries.length}\n\n`;

        if (data.entries.length > 0) {
          // For large result sets, show a summary instead of all data
          if (data.entries.length > 10) {
            formattedResponse += 'First 10 entries (showing UIDs):\n';
            for (let i = 0; i < 10; i++) {
              const entry = data.entries[i];
              formattedResponse += `${i + 1}. ${entry.uid} - ${entry.title || '[No title]'}\n`;
            }
            formattedResponse += `\n(${data.entries.length - 10} more entries not shown)\n\n`;
            formattedResponse += `Full response data:\n${JSON.stringify(data, null, 2)}`;
          } else {
            formattedResponse += `Entries:\n${JSON.stringify(data.entries, null, 2)}`;
          }
        } else {
          formattedResponse += 'No entries found matching the criteria.';
        }

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

        // Add query parameters if needed
        if (include_count) {
          url.searchParams.append('include_count', 'true');
        }

        if (skip > 0) {
          url.searchParams.append('skip', skip.toString());
        }

        if (limit !== 100) {
          url.searchParams.append('limit', limit.toString());
        }

        if (include_branch_info) {
          url.searchParams.append('include_branch_info', 'true');
        }

        const response = await c.fetch(url.toString(), {
          method: 'GET',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data: GlobalFieldsResponse = await response.json();

        // Format the response
        let formattedResponse = '';

        if (include_count && data.count) {
          formattedResponse += `Total global fields: ${data.count}\n\n`;
        }

        formattedResponse += `Global fields retrieved: ${data.global_fields.length}\n\n`;

        if (data.global_fields.length > 0) {
          // For large result sets, show a summary
          if (data.global_fields.length > 10) {
            formattedResponse += 'First 10 global fields:\n';
            for (let i = 0; i < 10; i++) {
              const globalField = data.global_fields[i];
              formattedResponse += `${i + 1}. ${globalField.uid} - ${globalField.title}\n`;
            }
            formattedResponse += `\n(${data.global_fields.length - 10} more global fields not shown)\n\n`;
          } else {
            formattedResponse += 'Global fields:\n';
            data.global_fields.forEach((globalField, index) => {
              formattedResponse += `${index + 1}. ${globalField.uid} - ${globalField.title}\n`;
            });
            formattedResponse += '\n';
          }

          formattedResponse += `Full response data:\n${JSON.stringify(data, null, 2)}`;
        } else {
          formattedResponse += 'No global fields found.';
        }

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
