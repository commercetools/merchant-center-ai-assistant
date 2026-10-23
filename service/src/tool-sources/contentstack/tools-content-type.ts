/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  ApiError,
  ContentTypeFieldRule,
  ContentTypeOptions,
  ContentTypePayload,
  ContentTypeResponse,
  ContentTypeSchema,
  ContentTypeTaxonomy,
} from './types';
import type { ContentstackClient } from './client';

export const contentTypeTools = (
  c: ContentstackClient
): Record<string, Tool> => ({
  create_content_type: {
    description:
      'Creates a new content type with the specified schema, options, field rules, and taxonomies.',
    inputSchema: z.object({
      title: z.string().describe('Content type title'),
      uid: z.string().describe('Content type UID (unique identifier)'),
      schema: z
        .array(z.object({}).loose())
        .describe(
          'Array of schema fields defining the content structure. Each field object should include properties like:\n- display_name: Field display name\n- uid: Unique identifier for the field\n- data_type: Type of data (text, number, boolean, file, etc.)\n- field_metadata: Additional metadata for the field\n- multiple: Whether field accepts multiple values\n- mandatory: Whether field is required\n- unique: Whether field values must be unique'
        ),
      options: z
        .object({
          is_page: z
            .boolean()
            .optional()
            .describe(
              'Set to true for webpage content types, false for content blocks'
            ),
          singleton: z
            .boolean()
            .optional()
            .describe(
              'Set to true for single content types, false for multiple'
            ),
          title: z.string().optional().describe('Field to use as the title'),
          sub_title: z
            .array(z.string())
            .optional()
            .describe('Fields to use as subtitles'),
          url_pattern: z
            .string()
            .optional()
            .describe('Default URL pattern for entries'),
          url_prefix: z.string().optional().describe('Path prefix for entries'),
        })
        .optional()
        .describe(
          'Content type options like webpage/content block settings and URL patterns'
        ),
      field_rules: z
        .array(
          z.object({
            conditions: z.array(
              z.object({
                operand_field: z
                  .string()
                  .describe('Field on which to apply condition'),
                operator: z
                  .string()
                  .describe('Operator for condition (e.g., equals, contains)'),
                value: z.any().describe('Expected value for the condition'),
              })
            ),
            actions: z.array(
              z.object({
                action: z.string().describe('Action to perform (show/hide)'),
                target_field: z
                  .string()
                  .describe('Field to show/hide based on condition'),
              })
            ),
            match_type: z
              .string()
              .describe('Whether all or any conditions should be met'),
          })
        )
        .optional()
        .describe(
          'Field visibility rules for showing/hiding fields based on conditions'
        ),
      taxonomies: z
        .array(
          z.object({
            taxonomy_uid: z.string().describe('Taxonomy UID to link'),
            max_terms: z
              .number()
              .optional()
              .describe('Maximum number of terms allowed (up to 25)'),
            mandatory: z
              .boolean()
              .optional()
              .describe('Whether this taxonomy is required'),
            non_localizable: z
              .boolean()
              .optional()
              .describe('Whether this taxonomy is non-localizable'),
          })
        )
        .optional()
        .describe('Taxonomies to associate with this content type'),
    }),
    execute: async ({
      title,
      uid,
      schema,
      options,
      field_rules,
      taxonomies,
    }: {
      title: string;
      uid: string;
      schema: ContentTypeSchema[];
      options: ContentTypeOptions;
      field_rules: ContentTypeFieldRule[];
      taxonomies: ContentTypeTaxonomy[];
    }) => {
      try {
        // Prepare the content type payload
        const payload: ContentTypePayload = {
          content_type: {
            title,
            uid,
            schema: schema as ContentTypeSchema[],
            options: options || {
              is_page: true,
              singleton: false,
              title: 'title',
              sub_title: [],
              url_pattern: '/:title',
              url_prefix: '/',
            },
          },
        };

        // Add field_rules if provided
        if (field_rules && field_rules.length > 0) {
          payload.content_type.field_rules =
            field_rules as ContentTypeFieldRule[];
        }

        // Add taxonomies if provided
        if (taxonomies && taxonomies.length > 0) {
          // Add the taxonomies field to the content_type object directly, not in schema
          payload.content_type.taxonomies = taxonomies;
        }

        const response = await c.fetch(`${c.apiBaseUrl}/content_types`, {
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
              text: `Content type "${title}" created successfully with UID "${uid}".`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = c.handleError(error as ApiError);
        return {
          content: [
            {
              type: 'text',
              text: `Error creating content type: ${errorMessage}\n\nPlease ensure your schema adheres to the Contentstack schema specification. Schema should be an array of field objects. Example field objects:

// Title field example
{
  "display_name": "Title",
  "uid": "title",
  "data_type": "text",
  "mandatory": true,
  "unique": true,
  "field_metadata": {
    "_default": true
  },
  "multiple": false
}

// Rich text editor example
{
  "display_name": "Description",
  "uid": "description",
  "data_type": "text",
  "field_metadata": {
    "allow_rich_text": true,
    "description": "",
    "multiline": false,
    "rich_text_type": "advanced"
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
  update_content_type: {
    description:
      'Updates an existing content type identified by its UID. Allows modification of title, schema, options, and field rules.',
    inputSchema: z.object({
      uid: z.string().describe('Content type UID to update'),
      title: z.string().optional().describe('New content type title'),
      schema: z
        .array(z.object({}).passthrough())
        .optional()
        .describe(
          'Array of schema fields defining the content structure. Each field object should include properties like:\n- display_name: Field display name\n- uid: Unique identifier for the field\n- data_type: Type of data (text, number, boolean, file, etc.)\n- field_metadata: Additional metadata for the field\n- multiple: Whether field accepts multiple values\n- mandatory: Whether field is required\n- unique: Whether field values must be unique'
        ),
      options: z
        .object({
          is_page: z
            .boolean()
            .optional()
            .describe(
              'Set to true for webpage content types, false for content blocks'
            ),
          singleton: z
            .boolean()
            .optional()
            .describe(
              'Set to true for single content types, false for multiple'
            ),
          title: z.string().optional().describe('Field to use as the title'),
          sub_title: z
            .array(z.string())
            .optional()
            .describe('Fields to use as subtitles'),
          url_pattern: z
            .string()
            .optional()
            .describe('Default URL pattern for entries'),
          url_prefix: z.string().optional().describe('Path prefix for entries'),
        })
        .optional()
        .describe(
          'Content type options like webpage/content block settings and URL patterns'
        ),
      field_rules: z
        .array(
          z.object({
            conditions: z.array(
              z.object({
                operand_field: z
                  .string()
                  .describe('Field on which to apply condition'),
                operator: z
                  .string()
                  .describe('Operator for condition (e.g., equals, contains)'),
                value: z.any().describe('Expected value for the condition'),
              })
            ),
            actions: z.array(
              z.object({
                action: z.string().describe('Action to perform (show/hide)'),
                target_field: z
                  .string()
                  .describe('Field to show/hide based on condition'),
              })
            ),
            match_type: z
              .string()
              .describe('Whether all or any conditions should be met'),
          })
        )
        .optional()
        .describe(
          'Field visibility rules for showing/hiding fields based on conditions'
        ),
    }),
    execute: async ({
      uid,
      title,
      schema,
      options,
      field_rules,
    }: {
      uid: string;
      title: string;
      schema: ContentTypeSchema[];
      options: ContentTypeOptions;
      field_rules: ContentTypeFieldRule[];
    }) => {
      try {
        // First fetch existing content type
        const fetchResponse = await c.fetch(
          `${c.apiBaseUrl}/content_types/${uid}`,
          {
            method: 'GET',
            headers: c.headers,
          }
        );

        if (!fetchResponse.ok) {
          throw await c.toApiError(fetchResponse);
        }

        const fetchData: ContentTypeResponse = await fetchResponse.json();
        const existingContentType = fetchData.content_type;

        // Prepare update payload
        const payload: ContentTypePayload = {
          content_type: {
            ...existingContentType,
            title: title || existingContentType.title,
            schema: schema
              ? (schema as ContentTypeSchema[])
              : existingContentType.schema,
          },
        };

        // Update options if provided
        if (options) {
          payload.content_type.options = {
            ...existingContentType.options,
            ...options,
          };
        }

        // Update field_rules if provided
        if (field_rules) {
          payload.content_type.field_rules =
            field_rules as ContentTypeFieldRule[];
        }

        // Update content type
        const response = await c.fetch(`${c.apiBaseUrl}/content_types/${uid}`, {
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
              text: `Content type "${uid}" updated successfully.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = c.handleError(error as ApiError);
        return {
          content: [
            {
              type: 'text',
              text: `Error updating content type: ${errorMessage}\n\nPlease ensure your schema adheres to the Contentstack schema specification. Schema should be an array of field objects. Example field objects:

// Single line text field example
{
  "display_name": "Field Name",
  "uid": "field_uid",
  "data_type": "text",
  "field_metadata": {
    "description": "Field description"
  },
  "multiple": false,
  "mandatory": false,
  "unique": false
}

// Select field example
{
  "display_name": "Category",
  "uid": "category",
  "data_type": "text",
  "display_type": "dropdown",
  "enum": {
    "advanced": false,
    "choices": [
      {"value": "Technology"},
      {"value": "Finance"},
      {"value": "Health"}
    ]
  },
  "multiple": true,
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
  delete_content_type: {
    description: 'Deletes a content type identified by its UID.',
    inputSchema: z.object({
      uid: z.string().describe('Content type UID to delete'),
    }),
    execute: async ({ uid }: { uid: string }) => {
      try {
        const response = await c.fetch(`${c.apiBaseUrl}/content_types/${uid}`, {
          method: 'DELETE',
          headers: c.headers,
        });

        if (!response.ok) {
          throw await c.toApiError(response);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Content type "${uid}" deleted successfully.`,
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
