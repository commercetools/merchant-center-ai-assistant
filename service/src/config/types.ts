/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export type NodeEnv = 'development' | 'test' | 'production';

/** Errors are always `KEY: rule`; they never contain the configured value. */
export interface SectionResult<T> {
  value?: T;
  errors: string[];
}

export interface ParseContext {
  nodeEnv: NodeEnv;
  /** Sections parsed so far (registry order), for cross-section defaults. */
  partial: Record<string, unknown>;
}

export type SectionParser<T> = (
  env: NodeJS.ProcessEnv,
  ctx: ParseContext
) => SectionResult<T>;
