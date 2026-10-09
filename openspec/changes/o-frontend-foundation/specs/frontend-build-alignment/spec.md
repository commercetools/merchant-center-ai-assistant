## ADDED Requirements

### Requirement: Single App Kit version across the three frontends
Every `@commercetools-frontend/*` dependency in `mc-app/package.json`, `composed-apps/package.json` and `mc-view-app/package.json` MUST be pinned to the same exact version (27.9.6).

#### Scenario: Versions agree
- **WHEN** `node scripts/check-versions.mjs` reads the three package.json files
- **THEN** exactly one distinct `@commercetools-frontend/*` version is reported

#### Scenario: Version drift is caught
- **WHEN** one package.json is edited to another App Kit version
- **THEN** the check exits non-zero and names the offending file

### Requirement: Node 22 and independent yarn installs
Each frontend folder MUST declare Node 22 (`.nvmrc` containing `22`, `engines.node` `22.x`), MUST own a committed `yarn.lock`, and the repository MUST NOT contain a root `package.json` with a `workspaces` field.

#### Scenario: Fresh install in one folder
- **WHEN** a developer runs `yarn install --frozen-lockfile` inside `mc-app/` only
- **THEN** installation succeeds without touching `composed-apps/` or `mc-view-app/`

#### Scenario: No workspace root
- **WHEN** the repository root is inspected
- **THEN** no `package.json` declares `workspaces`

### Requirement: Uniform script contract
Each frontend MUST expose `build`, `start`, `compile-html`, `typecheck`, `lint` and `format` scripts with the same implementation, and MUST NOT expose unused starter scripts (`extract-intl`, netlify helpers).

#### Scenario: Gates pass
- **WHEN** `yarn typecheck && yarn lint && yarn build` runs in each folder
- **THEN** all three commands exit 0 in all three folders

### Requirement: No leftovers or secrets
The frontends MUST NOT contain a committed `.env`, `netlify.toml`, starter `helpers.ts`/`types.ts`/`test-utils`, generated `ctp.ts` schema types, `core.json` starter strings, `console.log` calls, ngrok or `run.app` hostnames, nor the words "tenant", "multitenant" or "x-mc-team-id".

#### Scenario: Leftover scan
- **WHEN** the scan command in tasks.md section 9 is run
- **THEN** it reports zero matches

### Requirement: SPDX header on every source file
Every `.ts`, `.tsx` and `.mjs` file authored or ported by this change MUST begin with `// SPDX-License-Identifier: MIT` followed by the project copyright line chosen by change A.

#### Scenario: Header check
- **WHEN** `node scripts/spdx-check.mjs` (from change A) runs over the three frontends
- **THEN** it exits 0
