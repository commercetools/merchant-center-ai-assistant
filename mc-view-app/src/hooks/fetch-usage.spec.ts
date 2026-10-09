/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const rel = (file: string) =>
  path.relative(SRC, file).split(path.sep).join('/');

describe('gateway usage', () => {
  const files = walk(SRC).filter((file) => !/\.spec\.tsx?$/.test(file));

  // Everything that calls the service must go through `useFetch`, which appends the
  // `customView` flag. The exceptions are deliberate: the identity connect flow (not scoped
  // to a host page) and the private-image blob loader (bytes do not depend on the page).
  const ALLOWED = new Set([
    'utils/forward-to.ts',
    'hooks/use-fetch.ts',
    'hooks/use-identity-mcp/index.ts',
    'hooks/use-chat-service-connector/request.ts',
  ]);

  it('only the allowed modules import forwardToFetch / forwardToJson', () => {
    const offenders = files
      .filter((file) => !ALLOWED.has(rel(file)))
      .filter((file) =>
        /import\s*{[^}]*forwardTo(Fetch|Json)[^}]*}/.test(
          fs.readFileSync(file, 'utf8')
        )
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('has no admin-only wiring and no e-mail handling', () => {
    const offenders = files
      .filter((file) =>
        /userEmail|userLabel|user\?\.email|managed-mcp(?!-identity)|create-api-client/.test(
          fs.readFileSync(file, 'utf8')
        )
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('never reads isAdmin outside the bootstrap plumbing', () => {
    const offenders = files
      .filter((file) => /isAdmin/.test(fs.readFileSync(file, 'utf8')))
      .map(rel)
      .filter(
        (name) =>
          name !== 'contexts/auth.tsx' &&
          name !== 'hooks/use-mc-session/index.ts'
      );
    expect(offenders).toEqual([]);
  });
});
