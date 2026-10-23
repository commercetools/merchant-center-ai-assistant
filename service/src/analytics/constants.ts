/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Every cap of the analytics layer lives here (spec-normative, asserted by constants.spec.ts). */

/** Rows stored per offload; beyond this the rows are dropped and the model is told. */
export const OFFLOAD_MAX_ROWS = 20_000;
export const OFFLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const INSERT_CHUNK_ROWS = 500;
export const TABLE_TTL_MS = 7 * 24 * 3600_000;

/** int64 in the REST API, hence a string. */
export const QUERY_MAX_BYTES_BILLED = '200000000';
export const QUERY_JOB_TIMEOUT_MS = 60_000;
export const QUERY_MAX_ROWS = 500;
export const QUERY_RESULT_MAX_BYTES = 256 * 1024;

export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_MAX_BYTES = 5 * 1024 * 1024;

export const CLEANUP_CONCURRENCY = 4;
