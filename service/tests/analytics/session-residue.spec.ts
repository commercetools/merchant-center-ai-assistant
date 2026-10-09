/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { countSessionResidue, type ResiduePorts } from '../../src/gcp/session-residue';

const SESSION = '3f1c0b5e-aaaa-4bbb-8ccc-0123456789ab';

const ports = (tableIds: string[], objects: string[]): ResiduePorts => ({
  listTableIds: async () => tableIds,
  listObjectNames: async (prefix) => objects.filter((o) => o.startsWith(prefix)),
});

describe('countSessionResidue', () => {
  it('is 0 and 0 when nothing of the session is left', async () => {
    expect(await countSessionResidue(SESSION, ports([], []))).toEqual({ tables: 0, images: 0 });
  });

  it('counts the session tables and images, and nothing of another session', async () => {
    const sanitised = SESSION.replace(/-/g, '_');
    const result = await countSessionResidue(
      SESSION,
      ports(
        [`${sanitised}_a`, `${sanitised}_b`, 'other_session_a', `${sanitised}x_a`],
        [`images/${SESSION}/1-aaaaaaaa.png`, 'images/other/1-bbbbbbbb.png', `images/${SESSION}x/1.png`]
      )
    );
    expect(result).toEqual({ tables: 2, images: 1 });
  });
});

describe('check-gcp-cleanup.mjs argument handling', () => {
  const script = join(process.cwd(), 'scripts', 'check-gcp-cleanup.mjs');
  const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });

  it('exits 2 without a session id or with an unsafe one', () => {
    expect(run([]).status).toBe(2);
    expect(run(['a b; rm']).status).toBe(2);
  });

  it('exits 3 without Google credentials and checks nothing', () => {
    const result = run([SESSION]);
    expect(result.status).toBe(3);
    expect(result.stdout).toBe('');
  });
});
