/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { EventEmitter } from 'node:events';
import type {
  BigQueryPort,
  DatasetPort,
  JobPort,
  TableMetadataPort,
  TablePort,
  TableReferencePort,
  WritableLike,
} from '../../src/analytics/bigquery/ports';

export const googleError = (code: number, message: string): Error =>
  Object.assign(new Error(message), { code });

interface FakeTable {
  id: string;
  rows: Record<string, unknown>[];
  options: Record<string, unknown>;
  deleted: boolean;
  metadata: TableMetadataPort;
}

export interface QueryScript {
  statementType?: string;
  referencedTables?: TableReferencePort[];
  rows?: Record<string, unknown>[];
  totalRows?: string;
  dryRunError?: Error;
  runError?: Error;
}

/** A scriptable in-memory stand-in for the BigQuery client (never talks to Google). */
export class FakeBigQuery implements BigQueryPort {
  datasetExists = true;
  createDatasetError?: Error;
  createDatasetCalls: { id: string; options: Record<string, unknown> }[] = [];
  tables = new Map<string, FakeTable>();
  insertCalls: number[] = [];
  /** Errors thrown by the next `insert` calls (shifted). */
  insertErrors: Error[] = [];
  loadJobs: string[] = [];
  jobs: Record<string, unknown>[] = [];
  script: QueryScript = { statementType: 'SELECT', referencedTables: [], rows: [] };
  metadataByTable: Record<string, TableMetadataPort> = {};
  metadataError?: Error;

  dataset(): DatasetPort {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      table: (id: string): TablePort => self.tablePort(id),
      async createTable(id: string, options: Record<string, unknown>) {
        if (!self.datasetExists) {
          throw googleError(404, 'Not found: Dataset fake-project-123:aiassistant');
        }
        self.tables.set(id, {
          id,
          rows: [],
          options,
          deleted: false,
          metadata: { schema: (options.schema as TableMetadataPort['schema']) ?? undefined },
        });
        return [self.tablePort(id)];
      },
    };
  }

  private tablePort(id: string): TablePort {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      async exists() {
        const t = self.tables.get(id);
        return [Boolean(t && !t.deleted)] as [boolean];
      },
      async getMetadata() {
        if (self.metadataError) throw self.metadataError;
        const meta = self.metadataByTable[id] ?? self.tables.get(id)?.metadata;
        if (!meta) throw googleError(404, 'Not found: Table');
        return [meta] as [TableMetadataPort];
      },
      async insert(rows) {
        const err = self.insertErrors.shift();
        if (err) throw err;
        self.insertCalls.push(rows.length);
        self.tables.get(id)?.rows.push(...rows);
        return [{}];
      },
      async delete() {
        const t = self.tables.get(id);
        if (t) t.deleted = true;
        return [{}];
      },
      createWriteStream(): WritableLike {
        const emitter = new EventEmitter();
        return {
          on(event, listener) {
            emitter.on(event, listener);
            return emitter;
          },
          end(chunk: string) {
            self.loadJobs.push(chunk);
            self.tables.get(id)?.rows.push(...chunk.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>));
            setImmediate(() => emitter.emit('complete'));
          },
        };
      },
    };
  }

  async createDataset(id: string, options: Record<string, unknown>): Promise<unknown> {
    this.createDatasetCalls.push({ id, options });
    if (this.createDatasetError) throw this.createDatasetError;
    this.datasetExists = true;
    return [{}];
  }

  async createQueryJob(options: Record<string, unknown>): Promise<[JobPort]> {
    this.jobs.push(options);
    const dry = options.dryRun === true;
    if (dry && this.script.dryRunError) throw this.script.dryRunError;
    const script = this.script;
    const job: JobPort = {
      id: dry ? 'dry' : 'job-1',
      metadata: {
        statistics: {
          query: {
            statementType: script.statementType,
            referencedTables: script.referencedTables,
          },
        },
      },
      async getQueryResults() {
        if (script.runError) throw script.runError;
        const rows = (script.rows ?? []).slice(0, 500);
        return [rows, undefined, { totalRows: script.totalRows ?? String((script.rows ?? []).length) }];
      },
    };
    return [job];
  }
}
