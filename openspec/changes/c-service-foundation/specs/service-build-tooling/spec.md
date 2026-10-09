## ADDED Requirements

### Requirement: Runtime and package manager
`service/` SHALL target Node.js 22 (`engines.node: ">=22 <25"`, `.nvmrc` `22`), use npm with exactly one lockfile (`package-lock.json`; no `yarn.lock`, because Connect selects Yarn when `yarn.lock` is present), and MUST NOT be part of an npm-workspaces root.

#### Scenario: One lockfile
- **WHEN** the `service/` folder is listed
- **THEN** `package-lock.json` exists and `yarn.lock` does not

### Requirement: Pinned dependencies
`service/package.json` SHALL declare at least: `@commercetools/platform-sdk@^8`, `@commercetools/ts-client@^4`, `@commercetools-backend/express@^27.9.6`, `@commercetools-backend/loggers@^27.9.6`, `express@^4.21`, `body-parser@^1.20`, `uuid`, `zod@^4.1`, and the AI SDK line used by the legacy service (`ai@7.0.92`, `@ai-sdk/mcp@^2.0.44`); specs F and L add `@ai-sdk/google-vertex`, `google-auth-library`, `@google-cloud/bigquery` and `@google-cloud/storage`. It MUST NOT depend on `dotenv`, `@google-cloud/firestore`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `openai`, `clinic`, or `@commercetools/sdk-client-v2`.

#### Scenario: Forbidden dependency gate
- **WHEN** `node scripts/check-deps.mjs` (or the grep in the verification task) runs
- **THEN** it exits non-zero if any forbidden package appears in `dependencies` or `devDependencies`

### Requirement: Build, lint, test scripts
`package.json` SHALL provide `build` (`rimraf ./build && tsc`), `start` (`node build/index.js`), `start:dev`, `lint`, `test` (Jest in ESM mode with `NODE_OPTIONS=--experimental-vm-modules`), `typecheck`, `connector:post-deploy` and `connector:pre-undeploy` (stubs owned by U). `commercetools connect application build`, `test` and `start` MUST succeed for the `service` application.

#### Scenario: Connect CLI runs the toolchain
- **WHEN** `commercetools connect application build --name service` and `commercetools connect application test --name service` are executed from the repo root
- **THEN** both exit 0

#### Scenario: Output port
- **WHEN** the built service starts with `PORT=8081`
- **THEN** it listens on 8081; without `PORT` it listens on 8080

### Requirement: Static quality gates
ESLint SHALL enforce `no-console: error`, `@typescript-eslint/no-explicit-any: error` in `src/`, and the `process.env` restriction. TypeScript MUST run with `strict: true`. Every source file MUST start with the SPDX header required by spec A.

#### Scenario: console.log is rejected
- **WHEN** a file contains `console.log('x')`
- **THEN** `npm run lint` fails

### Requirement: No committed environment files
The repository SHALL contain `service/.env.example` (keys, no values) and MUST git-ignore `service/.env*` except the example.

#### Scenario: Ignore rule
- **WHEN** `git check-ignore service/.env.local` is run
- **THEN** it prints the path
