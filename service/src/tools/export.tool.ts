/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';
import { EXPORT_MAX_BYTES, EXPORT_MAX_ROWS } from '../analytics/constants';

export const EXPORT_DATA_TOOL = 'export_data';

/**
 * Supported export formats
 */
const ExportFormat = z.enum(['csv']);

/**
 * Input schema for the export tool
 */
const exportDataSchema = z.object({
  data: z
    .array(z.record(z.string(), z.unknown()))
    .describe(
      'Array of JSON objects to export. Each object represents a row in the output file.'
    ),
  headers: z
    .array(z.string())
    .describe(
      'Array of column names/keys to include in the export. Only these fields will be exported from each object.'
    ),
  format: ExportFormat.describe(
    'The export format. Currently only "csv" is supported.'
  ),
  filename: z
    .string()
    .optional()
    .describe(
      'Optional filename for the exported file (without extension). Defaults to "export".'
    ),
});

/**
 * Output structure for successful export
 */
interface ExportSuccess {
  success: true;
  content: string;
  mimeType: string;
  filename: string;
  rowCount: number;
  columnCount: number;
}

/**
 * Output structure for export error
 */
interface ExportError {
  success: false;
  error: string;
  hint: string;
}

type ExportResult = ExportSuccess | ExportError;

/** A string cell a spreadsheet would execute as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralises formula injection: a string starting with `=`, `+`, `-`, `@`, tab or carriage
 * return gets a leading `'`. Real numbers (typeof number, including negatives) are untouched.
 * Data from commercetools (customer names, product titles) is attacker-influenceable.
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * Sanitises a model-supplied filename to `[A-Za-z0-9._-]` (at most 80 characters, default
 * `export`): `../../etc/passwd` becomes `etc_passwd`.
 */
export function safeFilename(name: string | undefined): string {
  return (
    (name ?? '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, 80) || 'export'
  );
}

/**
 * Escapes a CSV value according to RFC 4180
 * - Values containing commas, quotes, or newlines are wrapped in quotes
 * - Double quotes within values are escaped by doubling them
 * - String values that start like a formula are prefixed with `'` first
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let stringValue: string;

  if (typeof value === 'object') {
    stringValue = JSON.stringify(value);
  } else if (typeof value === 'string') {
    stringValue = neutraliseFormula(value);
  } else {
    stringValue = String(value);
  }

  // Check if the value needs to be quoted
  const needsQuoting =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Converts an array of objects to CSV format
 */
function jsonToCSV(data: Record<string, unknown>[], headers: string[]): string {
  // Create header row
  const headerRow = headers.map(escapeCSVValue).join(',');

  // Create data rows
  const dataRows = data.map((row) => {
    return headers
      .map((header) => {
        const value = row[header];
        return escapeCSVValue(value);
      })
      .join(',');
  });

  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Get file extension for the given format
 */
function getFileExtension(format: z.infer<typeof ExportFormat>): string {
  switch (format) {
    case 'csv':
      return 'csv';
    default:
      return 'txt';
  }
}

/**
 * Get MIME type for the given format
 */
function getMimeType(format: z.infer<typeof ExportFormat>): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    default:
      return 'text/plain';
  }
}

export const exportDataTool = {
  description: `Export JSON data to a downloadable file format (currently supports CSV).

CRITICAL INSTRUCTIONS:
- This tool generates a downloadable file that will be presented to the user.
- After calling this tool, DO NOT output the raw data or base64 content.
- The file download will be automatically available to the user.
- Simply call this tool and confirm the export was successful.

WHEN TO USE:
- Use when the user asks to export, download, or save data as a file.
- Use when the user wants data in CSV format.
- Use after data has been fetched or aggregated and needs to be exported.

INPUT REQUIREMENTS:
- data: Array of objects where each object is a row
- headers: Array of column names to include (must match keys in the data objects)
- format: Export format ("csv")
- filename: Optional custom filename (without extension)

EXAMPLE:
{
  "data": [{"id": "123", "name": "Product A", "price": 29.99}, {"id": "456", "name": "Product B", "price": 49.99}],
  "headers": ["id", "name", "price"],
  "format": "csv",
  "filename": "products"
}`,

  inputSchema: exportDataSchema,

  execute: async ({
    data,
    headers,
    format,
    filename,
  }: z.infer<typeof exportDataSchema>): Promise<ExportResult> => {
    try {
      // Validate data is not empty
      if (!data || data.length === 0) {
        return {
          success: false,
          error: 'No data provided for export',
          hint: 'Ensure the data array contains at least one object to export.',
        };
      }

      // Validate headers is not empty
      if (!headers || headers.length === 0) {
        return {
          success: false,
          error: 'No headers provided for export',
          hint: 'Specify at least one header/column name to include in the export.',
        };
      }

      // Check if headers exist in the data (warn but don't fail)
      const sampleRow = data[0];
      const missingHeaders = headers.filter((header) => !(header in sampleRow));
      if (missingHeaders.length === headers.length) {
        return {
          success: false,
          error: `None of the specified headers exist in the data: ${missingHeaders.join(', ')}`,
          hint: `Available keys in the data: ${Object.keys(sampleRow).join(', ')}`,
        };
      }

      if (data.length > EXPORT_MAX_ROWS) {
        return {
          success: false,
          error: `Too many rows to export: ${data.length} (maximum ${EXPORT_MAX_ROWS})`,
          hint: 'Filter or aggregate the data first (for example with query_aggregated_data), then export fewer rows.',
        };
      }

      // Generate the file content based on format
      let content: string;
      switch (format) {
        case 'csv':
          content = jsonToCSV(data, headers);
          break;
        default:
          return {
            success: false,
            error: `Unsupported format: ${format}`,
            hint: 'Currently only "csv" format is supported.',
          };
      }

      // Encode content as base64
      const base64Content = Buffer.from(content, 'utf-8').toString('base64');
      if (base64Content.length > EXPORT_MAX_BYTES) {
        return {
          success: false,
          error: `The export is too large: ${base64Content.length} bytes encoded (maximum ${EXPORT_MAX_BYTES})`,
          hint: 'Export fewer rows or columns: filter or aggregate the data first.',
        };
      }

      // Generate filename with extension
      const baseFilename = safeFilename(filename);
      const extension = getFileExtension(format);
      const fullFilename = `${baseFilename}.${extension}`;

      // Get MIME type
      const mimeType = getMimeType(format);

      return {
        success: true,
        content: base64Content,
        mimeType,
        filename: fullFilename,
        rowCount: data.length,
        columnCount: headers.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Export failed: ${errorMessage}`,
        hint: 'Check that the data format is valid and all headers are strings.',
      };
    }
  },
};
