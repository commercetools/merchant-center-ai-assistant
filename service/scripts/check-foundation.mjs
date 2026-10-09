/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Forbidden-content gate for service/: dependencies, tenancy words, lockfiles.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FORBIDDEN_DEPENDENCIES = [
  'dotenv',
  '@google-cloud/firestore',
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  'openai',
  'clinic',
  '@commercetools/sdk-client-v2',
];
export const FORBIDDEN_SOURCE = /tenant|firestore|validateProject|dotenv/i;
// Removed Google/LLM provider surface (change F). Only the config file that names the
// legacy variables for the boot warning and the express-mode guard may contain them.
export const FORBIDDEN_PROVIDER_SOURCE =
  /GEMINI_API_KEY|createGoogleGenerativeAI|createAnthropic|CLAUDE_API_KEY|OPENAI_API_KEY|ANTHROPIC_|GCP_SERVICE_ACCOUNT_|secrets\.utils|GOOGLE_APPLICATION_CREDENTIALS|from 'openai'/;
export const PROVIDER_SOURCE_ALLOWLIST = ['src/config/sections/gcp.ts'];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

export function check() {
  const problems = [];
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      if (FORBIDDEN_DEPENDENCIES.includes(name)) {
        problems.push(`package.json: forbidden dependency ${name} in ${section}`);
      }
    }
  }
  if (pkg.workspaces) problems.push('package.json: must not be an npm workspaces root');
  if (existsSync(join(root, 'yarn.lock'))) {
    problems.push('yarn.lock exists: Connect would select Yarn (use package-lock.json only)');
  }
  if (!existsSync(join(root, 'package-lock.json'))) problems.push('package-lock.json is missing');

  for (const file of sourceFiles(join(root, 'src'))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (FORBIDDEN_SOURCE.test(line)) {
          problems.push(`${relative(root, file)}:${i + 1}: forbidden word in source`);
        }
        if (
          FORBIDDEN_PROVIDER_SOURCE.test(line) &&
          !PROVIDER_SOURCE_ALLOWLIST.includes(relative(root, file))
        ) {
          problems.push(`${relative(root, file)}:${i + 1}: removed provider identifier in source`);
        }
      });
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = check();
  if (problems.length > 0) {
    process.stderr.write(problems.join('\n') + '\n');
    process.exit(1);
  }
  process.stdout.write('foundation gate ok\n');
}
