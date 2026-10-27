/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import type { ApiError } from './types';
import type { ContentstackClient } from './client';

export const entryTools = (c: ContentstackClient): Record<string, Tool> => ({
  create_entry: {
    description: 'Creates a new entry for a specified content type.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry: z
        .object({})
        .passthrough()
        .describe('Entry data according to content type schema'),
    }),
    execute: async ({
      content_type_uid,
      entry,
    }: {
      content_type_uid: string;
      entry: Record<string, unknown>;
    }) => {
      try {
        const payload = { entry };

        const response = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries?copy_to_master=true`,
          {
            method: 'POST',
            headers: c.headers,
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        const data = await response.json();

        return {
          content: [
            {
              type: 'text',
              text: `Entry created successfully in content type "${content_type_uid}". Entry UID: ${data.entry.uid}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: c.handleError(error as ApiError),
            },
          ],
          isError: true,
        };
      }
    },
  },
  update_entry: {
    description:
      'Updates an existing entry identified by its UID and content type UID.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry_uid: z.string().describe('Entry UID to update'),
      entry: z.object({}).passthrough().describe('Updated entry data'),
    }),
    execute: async ({
      content_type_uid,
      entry_uid,
      entry,
    }: {
      content_type_uid: string;
      entry_uid: string;
      entry: Record<string, unknown>;
    }) => {
      try {
        const payload = { entry };

        const response = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}`,
          {
            method: 'PUT',
            headers: c.headers,
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Entry "${entry_uid}" updated successfully in content type "${content_type_uid}".`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: c.handleError(error as ApiError),
            },
          ],
          isError: true,
        };
      }
    },
  },
  delete_entry: {
    description: 'Deletes an entry identified by its UID and content type UID.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry_uid: z.string().describe('Entry UID to delete'),
    }),
    execute: async ({
      content_type_uid,
      entry_uid,
    }: {
      content_type_uid: string;
      entry_uid: string;
    }) => {
      try {
        const response = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}`,
          {
            method: 'DELETE',
            headers: c.headers,
          }
        );

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Entry "${entry_uid}" deleted successfully from content type "${content_type_uid}".`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: c.handleError(error as ApiError),
            },
          ],
          isError: true,
        };
      }
    },
  },
  publish_entry: {
    description: 'Publishes an entry to a specified environment and locale.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry_uid: z.string().describe('Entry UID to publish'),
      environment: z.string().describe('Environment to publish to'),
      locale: z
        .string()
        .default('en-us')
        .describe('Locale code (defaults to en-us)'),
    }),
    execute: async ({
      content_type_uid,
      entry_uid,
      environment,
      locale,
    }: {
      content_type_uid: string;
      entry_uid: string;
      environment: string;
      locale: string;
    }) => {
      try {
        // First make sure the entry exists (a missing entry fails here with its own error)
        const entryResponse = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}`,
          {
            method: 'GET',
            headers: c.headers,
          }
        );

        if (!entryResponse.ok) {
          throw await c.toApiError(entryResponse);
        }

        // Prepare publish payload
        const payload = {
          entry: {
            environments: [environment],
            locales: [locale],
          },
        };

        // Publish the entry
        const response = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}/publish`,
          {
            method: 'POST',
            headers: c.headers,
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Entry "${entry_uid}" published successfully to environment "${environment}" in locale "${locale}".`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: c.handleError(error as ApiError),
            },
          ],
          isError: true,
        };
      }
    },
  },
  unpublish_entry: {
    description:
      'Unpublishes an entry from a specified environment and locale.',
    inputSchema: z.object({
      content_type_uid: z.string().describe('Content type UID'),
      entry_uid: z.string().describe('Entry UID to unpublish'),
      environment: z.string().describe('Environment to unpublish from'),
      locale: z
        .string()
        .default('en-us')
        .describe('Locale code (defaults to en-us)'),
    }),
    execute: async ({
      content_type_uid,
      entry_uid,
      environment,
      locale,
    }: {
      content_type_uid: string;
      entry_uid: string;
      environment: string;
      locale: string;
    }) => {
      try {
        // Prepare unpublish payload
        const payload = {
          entry: {
            environments: [environment],
            locales: [locale],
          },
        };

        // Unpublish the entry
        const response = await c.fetch(
          `${c.apiBaseUrl}/content_types/${content_type_uid}/entries/${entry_uid}/unpublish`,
          {
            method: 'POST',
            headers: c.headers,
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Entry "${entry_uid}" unpublished successfully from environment "${environment}" in locale "${locale}".`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: c.handleError(error as ApiError),
            },
          ],
          isError: true,
        };
      }
    },
  },
});
