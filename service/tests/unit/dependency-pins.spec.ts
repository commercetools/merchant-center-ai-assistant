/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The lockfile is what `npm ci` installs in the Connect build and what the dependency
 * scanner reads, so these versions are pinned there. A routine `npm install` or a lockfile
 * regeneration that quietly goes back to an advisory's affected release fails here. See
 * "Dependency advisories" in docs/security.md.
 */

type Lock = { packages: Record<string, { version?: string }> };
const lock = JSON.parse(
  readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8')
) as Lock;

interface Copy {
  path: string;
  version: string;
}

const copiesOf = (name: string): Copy[] =>
  Object.entries(lock.packages)
    .filter(
      ([path]) =>
        path === `node_modules/${name}` ||
        path.endsWith(`/node_modules/${name}`)
    )
    .map(([path, entry]) => ({ path, version: entry.version ?? '' }));

const parse = (version: string): number[] =>
  version.split('.').map((part) => Number.parseInt(part, 10));

/** True when `version` is `minimum` or newer within the same major line. */
const atLeast = (version: string, minimum: string): boolean => {
  const have = parse(version);
  const want = parse(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (have[i] !== want[i]) return have[i] > want[i];
  }
  return true;
};

/** The first release without the advisory, per major line of the package. */
const expectFixed = (name: string, fixedIn: Record<number, string>): void => {
  const copies = copiesOf(name);
  expect(copies.length).toBeGreaterThan(0);
  for (const { path, version } of copies) {
    const minimum = fixedIn[parse(version)[0]];
    // A major line this test has no fix for must be looked at, not waved through.
    expect({ path, version, known: minimum !== undefined }).toEqual({
      path,
      version,
      known: true,
    });
    expect({ path, version, patched: atLeast(version, minimum) }).toEqual({
      path,
      version,
      patched: true,
    });
  }
};

describe('dependency advisories pinned in package-lock.json', () => {
  it('body-parser: 1.20.9 for Express 4, 2.4.0 for the MCP SDK copy', () => {
    expectFixed('body-parser', { 1: '1.20.9', 2: '2.4.0' });
  });

  it('undici: 7.30.1', () => {
    expectFixed('undici', { 7: '7.30.1' });
  });

  it('zod: one copy, so the Stripe toolkit shares the service zod 4 (override in package.json)', () => {
    // zod CVE-2023-54404 has no fixed release, so a second, older copy cannot be patched
    // away. The `overrides` block keeps the toolkit and its peers on this one.
    const copies = copiesOf('zod');
    expect(copies).toHaveLength(1);
    expect(copies[0].path).toBe('node_modules/zod');
    expectFixed('zod', { 4: '4.6.7' });
  });
});
