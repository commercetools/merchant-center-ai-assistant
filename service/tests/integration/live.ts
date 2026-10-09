/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { readConfiguration } from '../../src/config';
import { CustomObjectGateway } from '../../src/persistence/gateway/custom-object.gateway';
import { purgeContainers } from '../../src/persistence/maintenance';

/** True when a scratch project is configured (service/.env.local or CTP_* variables). */
export const live = Boolean(process.env.CTP_CLIENT_SECRET && process.env.CTP_PROJECT_KEY);

/** `describe` when live, `describe.skip` otherwise: the suite is reported as skipped. */
export const liveDescribe = live ? describe : describe.skip;

/** Random prefix of one run: every object a test creates lives under it. */
export const newRunPrefix = (): string =>
  `ai-assistant-it-${randomUUID().replace(/-/g, '').slice(0, 10)}`;

export const liveConfig = () => readConfiguration();

export const liveGateway = () => new CustomObjectGateway();

/** Removes everything a run wrote under its prefix (containers made by name are listed too). */
export async function cleanupRun(prefix: string, extraContainers: string[] = []): Promise<void> {
  const gw = liveGateway();
  await purgeContainers(gw, { prefix });
  for (const container of extraContainers) {
    for (;;) {
      const page = await gw.query(container, { limit: 500, sort: { field: 'key', dir: 'asc' } });
      if (page.results.length === 0) break;
      await Promise.all(page.results.map((r) => gw.delete(container, r.key)));
    }
  }
}
