/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  ApiError,
  ContentTypeSchema,
  GlobalFieldPayload,
  GlobalFieldResponse,
} from './types';
import type { ContentstackClient } from './client';

export const globalFieldTools = (
  c: ContentstackClient
): Record<string, Tool> => ({
  create_global_field: {
    description:
      'Creates a new global field with the specified title, UID, and schema.',
    inputSchema: z.object({
      title: z.string().describe('Global field title'),
      uid: z.string().describe('Global field UID (unique identifier)'),
      schema: z
        .array(z.object({}).passthrough())
        .describe(
          'Array of schema fields defining the global field structure. Each field object should include properties like:\n- display_name: Field display name\n- uid: Unique identifier for the field\n- data_type: Type of data (text, number, boolean, file, etc.)\n- field_metadata: Additional metadata for the field\n- multiple: Whether field accepts multiple values\n- mandatory: Whether field is required\n- unique: Whether field values must be unique'
        ),
    }),
    execute: async ({
      title,
      uid,
      schema,
    }: {
      title: string;
      uid: string;
      schema: ContentTypeSchema[];
    }) => {
      try {
        // Prepare the global field payload
        const payload: GlobalFieldPayload = {
          global_field: {
            title,
            uid,
            schema: schema as ContentTypeSchema[],
          },
        };

        const response = await c.fetch(`${c.apiBaseUrl}/global_fields`, {
          method: 'POST',
          headers: c.headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Global field "${title}" created successfully with UID "${uid}".`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = c.handleError(error as ApiError);
        return {
          content: [
            {
              type: 'text',
              text: `Error creating global field: ${errorMessage}\n\nPlease ensure your schema adheres to the Contentstack schema specification. Schema should be an array of field objects. Example field objects:

// Text field example
{
  "display_name": "Name",
  "uid": "name",
  "data_type": "text",
  "multiple": false,
  "mandatory": false,
  "unique": false
}

// Rich text editor example
{
  "data_type": "text",
  "display_name": "Description",
  "uid": "description",
  "field_metadata": {
    "allow_rich_text": true,
    "description": "",
    "multiline": false,
    "rich_text_type": "advanced",
    "options": [],
    "version": 3
  },
  "multiple": false,
  "mandatory": false,
  "unique": false
}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
  update_global_field: {
    description:
      'Updates an existing global field identified by its UID. Allows modification of title and schema.',
    inputSchema: z.object({
      uid: z.string().describe('Global field UID to update'),
      title: z.string().optional().describe('New global field title'),
      schema: z
        .array(z.object({}).passthrough())
        .optional()
        .describe(
          'Updated schema fields defining the global field structure. Each field object should include properties like:\n- display_name: Field display name\n- uid: Unique identifier for the field\n- data_type: Type of data (text, number, boolean, file, etc.)\n- field_metadata: Additional metadata for the field\n- multiple: Whether field accepts multiple values\n- mandatory: Whether field is required\n- unique: Whether field values must be unique'
        ),
    }),
    execute: async ({
      uid,
      title,
      schema,
    }: {
      uid: string;
      title: string;
      schema: ContentTypeSchema[];
    }) => {
      try {
        // First fetch existing global field
        const fetchResponse = await c.fetch(
          `${c.apiBaseUrl}/global_fields/${uid}`,
          {
            method: 'GET',
            headers: c.headers,
          }
        );

        if (!fetchResponse.ok) {
          throw await c.toApiError(fetchResponse);
        }

        const fetchData: GlobalFieldResponse = await fetchResponse.json();
        const existingGlobalField = fetchData.global_field;

        // Prepare update payload
        const payload = {
          global_field: {
            ...existingGlobalField,
            title: title || existingGlobalField.title,
          },
        };

        // Update schema if provided
        if (schema) {
          payload.global_field.schema = schema as ContentTypeSchema[];
        }

        // Update global field
        const response = await c.fetch(`${c.apiBaseUrl}/global_fields/${uid}`, {
          method: 'PUT',
          headers: c.headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Global field "${uid}" updated successfully.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = c.handleError(error as ApiError);
        return {
          content: [
            {
              type: 'text',
              text: `Error updating global field: ${errorMessage}\n\nPlease ensure your schema adheres to the Contentstack schema specification. Schema should be an array of field objects. Example field objects:

// Text field example
{
  "display_name": "Name",
  "uid": "name",
  "data_type": "text",
  "multiple": false,
  "mandatory": false,
  "unique": false
}

// Rich text editor example
{
  "data_type": "text",
  "display_name": "Description",
  "uid": "description",
  "field_metadata": {
    "allow_rich_text": true,
    "description": "",
    "multiline": false,
    "rich_text_type": "advanced",
    "options": [],
    "version": 3
  },
  "multiple": false,
  "mandatory": false,
  "unique": false
}`,
            },
          ],
          isError: true,
        };
      }
    },
  },
});
