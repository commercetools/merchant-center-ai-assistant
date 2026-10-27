/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { parseAuth } from './auth';
import { parseCache } from './cache';
import { parseChat } from './chat';
import { parseCtp } from './ctp';
import { parseGcp } from './gcp';
import { parseLlm } from './llm';
import { parseNimbus } from './nimbus';
import { parsePersistence } from './persistence';
import { parseProviders } from './providers';
import { parseServer } from './server';

/**
 * One line per section. A new section = a new file + one line here (and its keys in
 * connect.yaml, service/.env.example and the two configuration tables, in README.md and
 * docs/configuration.md).
 */
export const SECTIONS = {
  server: parseServer,
  ctp: parseCtp,
  auth: parseAuth,
  persistence: parsePersistence,
  gcp: parseGcp,
  llm: parseLlm,
  cache: parseCache,
  chat: parseChat,
  nimbus: parseNimbus,
  providers: parseProviders,
} as const;

export type AppConfig = {
  [K in keyof typeof SECTIONS]: NonNullable<
    ReturnType<(typeof SECTIONS)[K]>['value']
  >;
};
