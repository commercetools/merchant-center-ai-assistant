/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Limits verified against the platform documentation. */
export const MIB = 1024 * 1024;

/** Above this a warning is logged. */
export const SOFT_OBJECT_BYTES = 1 * MIB;
/** Above this a write is refused before any request (platform hard limit is 16 MB). */
export const HARD_OBJECT_BYTES = 6 * MIB;

/** Largest page the platform returns. */
export const PAGE = 500;
/** Largest offset the platform accepts. */
export const MAX_OFFSET = 10000;
/** Longest `in` list used in one predicate. */
export const KEYIN_MAX = 50;
/** Longest readable session (offset ceiling). */
export const MESSAGES_CEILING = 10000;
