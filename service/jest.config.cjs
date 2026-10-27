/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * ai v7 and the @ai-sdk/* v4 line are ESM-only (`"type": "module"`, no `require` export
 * condition). The service itself compiles to CommonJS and relies on Node 22's `require(esm)`
 * support at runtime, but Jest's module registry has no equivalent: it would try to parse
 * `node_modules/ai/dist/index.js` as CJS and fail on the first `import`.
 *
 * Running Jest in ESM mode is the smallest fix that keeps the suite working without
 * converting the whole service. Requires `--experimental-vm-modules` (see the `test` script).
 * Consequence: `__dirname` and `require` do not exist in test code or in code under test.
 */
module.exports = {
  displayName: 'Service',
  // Each worker loads the ESM AI SDKs; many parallel workers get OOM-killed in the memory-limited
  // Connect validation container (SIGKILL), so the worker count is capped.
  maxWorkers: 4,
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/tests/**/*.spec.ts'],
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // The service tsconfig emits CommonJS (correct for the build); tests need ESM output.
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          strict: true,
          esModuleInterop: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          // The build tsconfig has rootDir=src; tests live outside it.
          rootDir: '.',
        },
      },
    ],
  },
  // Let ESM-style `./foo.js` specifiers resolve to the TypeScript source.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
