/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ResolvedNimbusMcp {
  /** Absolute path of `dist/index.js`, the stdio server entry. */
  entry: string;
  /** Version read from the installed package.json. */
  version: string;
}

export interface NimbusResolveError {
  error: string;
}

const PACKAGE_DIR = path.join('node_modules', '@commercetools', 'nimbus-mcp');

const findFrom = (
  startDir: string
): ResolvedNimbusMcp | NimbusResolveError | undefined => {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, PACKAGE_DIR);
    const manifest = path.join(candidate, 'package.json');
    if (fs.existsSync(manifest)) {
      const entry = path.join(candidate, 'dist', 'index.js');
      if (!fs.existsSync(entry)) {
        return {
          error: `found @commercetools/nimbus-mcp at ${candidate} but ${entry} is missing`,
        };
      }
      const version = (
        JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version?: string }
      ).version;
      return { entry, version: version ?? 'unknown' };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

/**
 * Finds the installed `@commercetools/nimbus-mcp` on disk. Neither `require` nor
 * `require.resolve` can: the package `exports` map only has an `import` condition (and does
 * not export `package.json`), so both throw `ERR_PACKAGE_PATH_NOT_EXPORTED` from CommonJS.
 * Walking up `node_modules` bypasses the map. Never throws.
 *
 * Starts at the working directory (Connect starts the service from the application folder);
 * `__dirname` does not exist in Jest's ESM mode, so it is only a second chance.
 */
export const resolveNimbusMcp = (
  startDir: string = process.cwd()
): ResolvedNimbusMcp | NimbusResolveError => {
  try {
    const found = findFrom(startDir);
    if (found) return found;
    if (typeof __dirname === 'string' && __dirname !== startDir) {
      const second = findFrom(__dirname);
      if (second) return second;
    }
    return {
      error: `could not locate ${PACKAGE_DIR} from ${startDir} - is it installed?`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const isResolveError = (
  value: ResolvedNimbusMcp | NimbusResolveError
): value is NimbusResolveError => 'error' in value;
