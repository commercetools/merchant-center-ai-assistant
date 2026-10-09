/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** BigQuery table schema field definition. */
export interface BigQuerySchemaField {
  name: string;
  type:
    | 'STRING'
    | 'BYTES'
    | 'INTEGER'
    | 'INT64'
    | 'FLOAT'
    | 'FLOAT64'
    | 'NUMERIC'
    | 'BIGNUMERIC'
    | 'BOOLEAN'
    | 'BOOL'
    | 'TIMESTAMP'
    | 'DATE'
    | 'TIME'
    | 'DATETIME'
    | 'GEOGRAPHY'
    | 'RECORD'
    | 'STRUCT'
    | 'JSON';
  mode?: 'NULLABLE' | 'REQUIRED' | 'REPEATED';
  description?: string;
  fields?: BigQuerySchemaField[];
}

export type Row = Record<string, unknown>;

export interface TableMetadataResult {
  schema: { fields?: { name?: string; type?: string }[] } | undefined;
  numRows: string | undefined;
  numBytes: string | undefined;
  creationTime: string | undefined;
  lastModifiedTime: string | undefined;
}
