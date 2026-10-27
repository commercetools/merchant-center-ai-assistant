/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Schema Helper Utilities
 *
 * Utilities for working with page schemas, including
 * encoding/decoding and formatting for display.
 */

/**
 * Safely decode a base64 encoded string.
 * Returns the original string if decoding fails.
 */
export function decodeBase64Safe(base64: string): string {
  try {
    return atob(base64);
  } catch {
    return base64;
  }
}

/**
 * Safely encode a string to base64.
 * Returns the original string if encoding fails.
 */
export function encodeBase64Safe(text: string): string {
  try {
    return btoa(text);
  } catch {
    return text;
  }
}

type TDataSource = {
  id: string;
  name: string;
  query: string;
  variables?: unknown[];
};

type TImportDefinition = {
  source: string;
  items: string[];
};

type TComponentDefinition = {
  name: string;
  dataSources?: TDataSource[];
  imports?: TImportDefinition[];
  code: {
    text?: string;
    transpiledCode?: string;
  };
};

type TSchemaWithComponents = {
  components?: TComponentDefinition[];
};

type TPreviewData = {
  uri: string;
  schema: Record<string, unknown>;
};

/**
 * Format schema for display, decoding base64 code for readability.
 * Hides transpiled code for brevity.
 */
export function formatSchemaForDisplay(previewData: TPreviewData): unknown {
  const schema = previewData.schema as TSchemaWithComponents;

  if (schema.components && Array.isArray(schema.components)) {
    return {
      ...previewData,
      schema: {
        ...schema,
        components: schema.components.map((comp) => ({
          name: comp.name,
          dataSources: comp.dataSources,
          imports: comp.imports,
          code: {
            text: comp.code?.text
              ? decodeBase64Safe(comp.code.text)
              : undefined,
            // transpiledCode: comp.code?.transpiledCode
            //   ? '/* transpiled code hidden for brevity */'
            //   : undefined,
            // decode cfrom base64 to string
            transpiledCode: comp.code?.transpiledCode
              ? decodeBase64Safe(comp.code?.transpiledCode)
              : '',
          },
        })),
      },
    };
  }

  return previewData;
}
