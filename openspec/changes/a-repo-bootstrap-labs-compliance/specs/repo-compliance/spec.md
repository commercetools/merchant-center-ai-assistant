## ADDED Requirements

### Requirement: MIT license file with the labs holder text
The repository root SHALL contain a `LICENSE` file with the MIT license text whose copyright line reads `Copyright (c) <year> commercetools GmbH and the commercetools-labs contributors`, byte-identical to the file the private `ossify.mjs --apply` writes. No other `LICENSE`, `LICENCE` or `COPYING` file SHALL exist in any subdirectory.

#### Scenario: Root license matches the tool output
- **WHEN** a developer runs `node scripts/spdx-check.mjs --license`
- **THEN** the command exits 0 and reports that `LICENSE` contains the MIT text and the holder line

#### Scenario: A nested license file is rejected
- **WHEN** a file named `service/LICENSE` exists
- **THEN** `node scripts/check-repo-rules.mjs` exits non-zero and names the path as a "third-party subtree" risk

### Requirement: "Unsupported" is stated in three places
The words "unsupported" (case-insensitive) SHALL appear in (1) the SPDX/disclaimer header of every source file, (2) the first 15 lines of `README.md` inside a banner, and (3) `SUPPORT.md`. `CONTRIBUTING.md` SHALL exist and SHALL repeat that contributions are accepted without a support commitment.

#### Scenario: Banner present in README
- **WHEN** `node scripts/check-repo-rules.mjs` runs
- **THEN** it verifies `README.md` lines 1-15 contain the word "unsupported" and fails otherwise

#### Scenario: Support file present
- **WHEN** `SUPPORT.md` is missing or does not contain "unsupported"
- **THEN** `node scripts/check-repo-rules.mjs` exits non-zero

### Requirement: SPDX header on every source file
Every tracked source file with extension `.ts .tsx .js .jsx .mjs .cjs .mts .cts .java .kt .swift .css .scss .sh` (excluding generated paths and third-party directories listed in the checker) SHALL start with the three-line banner `SPDX-License-Identifier: MIT` / `Copyright (c) <year> commercetools GmbH and the commercetools-labs contributors` / `Freely available, AS IS and UNSUPPORTED. See LICENSE.` in the comment syntax of that language, after an optional shebang. `.json`, `.yaml`, `.yml`, `.md`, `.toml`, lock files and images SHALL NOT be headered.

#### Scenario: Missing header detected
- **WHEN** a new file `service/src/foo.ts` has no SPDX line in its first 600 characters
- **THEN** `node scripts/spdx-check.mjs` exits 1 and prints `service/src/foo.ts`

#### Scenario: Shebang is preserved
- **WHEN** `scripts/labs-gate.sh` starts with `#!/usr/bin/env bash` followed by the banner
- **THEN** `node scripts/spdx-check.mjs` accepts the file

#### Scenario: Generated output is exempt
- **WHEN** a file exists under `public/`, `dist/`, `build/`, `types/generated/` or is a lock file
- **THEN** the checker ignores it

### Requirement: Package naming rule
Every `package.json` in the repository SHALL carry a `name` of the form `ai-assistant` or `ai-assistant-<suffix>` (lowercase letters and hyphens) during development, or the identical name prefixed with `@commercetools-labs/` after `ossify` has run. The four deployable packages SHALL be named `ai-assistant-service`, `ai-assistant-mc-app`, `ai-assistant-composed-apps` and `ai-assistant-mc-view-app`. Any other scope SHALL be rejected.

#### Scenario: Valid names
- **WHEN** `service/package.json` has `"name": "ai-assistant-service"`
- **THEN** `node scripts/spdx-check.mjs --names` passes and the expected ossify result is `@commercetools-labs/ai-assistant-service`

#### Scenario: Foreign scope
- **WHEN** a package is named `@acme/service-typescript` or `service-typescript`
- **THEN** the check fails and prints the expected pattern

### Requirement: No CI, container or IaC files
The repository SHALL NOT contain `.github/workflows/`, `.github/dependabot.yml`, `.gitlab-ci.yml`, `.circleci/`, `azure-pipelines.yml`, `cloudbuild.yaml`, `Dockerfile*`, `docker-compose*`, `netlify.toml`, `vercel.json`, `*.tf` or `*.tfvars`. Deployment SHALL happen only through the Connect CLI scripts (change U).

#### Scenario: Scaffold leftovers are caught
- **WHEN** `commercetools connect init` (or any generator) leaves a `.github/workflows/ci.yml` in the tree
- **THEN** `node scripts/check-repo-rules.mjs` exits non-zero naming the file

### Requirement: Secret and environment-file hygiene
`.gitignore` SHALL exclude `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.p12`, `service-account*.json`, `.npmrc`, `node_modules/`, build outputs (`build/`, `dist/`, `public/` for Merchant Center apps, `coverage/`), `plans/evidence/` and Connect CLI logs. A tracked `.env.example` SHALL contain only keys with an empty value or a non-secret placeholder (boolean, integer, `replace-me`, an `http(s)://localhost...` or `example.` URL, or a lowercase enum word); keys whose name contains `SECRET`, `KEY`, `TOKEN`, `PASSWORD` or `CREDENTIAL` SHALL have an empty value.

#### Scenario: Secret-looking value in an example file
- **WHEN** `service/.env.example` contains `GCP_SA_KEY_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50In0=`
- **THEN** `node scripts/check-repo-rules.mjs` exits non-zero naming file and key

#### Scenario: Real env file is untracked
- **WHEN** a developer creates `service/.env.local` and runs `git status`
- **THEN** the file does not appear as untracked

### Requirement: Local wrappers for the private publication tooling
`scripts/labs-gate.sh` SHALL locate the private `ossify.mjs` and `gate.mjs` through the environment variable `LABS_PUBLISH_DIR`, SHALL fail with a clear message when it is unset or does not contain both scripts, SHALL default to the ossify dry-run, and SHALL NOT copy, embed or print `policy.json`. No file in the repository SHALL contain `policy.json` content.

#### Scenario: Variable missing
- **WHEN** `scripts/labs-gate.sh gate` is run without `LABS_PUBLISH_DIR`
- **THEN** it exits with code 2 and prints how to set the variable

#### Scenario: Default is dry-run
- **WHEN** `scripts/labs-gate.sh ossify` is run with a valid `LABS_PUBLISH_DIR`
- **THEN** it invokes `ossify.mjs --repo <root>` without `--apply`

### Requirement: Prose hygiene
Published code and root documents SHALL NOT use the three framing words defined in the checker constant `FRAMING_WORDS` (word-boundary match, case-insensitive; the list mirrors the publication gate's framing warning). The check SHALL also run in a `--docs` mode over the Markdown files under `plans/` and `openspec/` (these folders are published as design documentation, so they are NOT skipped). In the development tree `--docs` SHALL report findings (`DOCS-HYGIENE path:line class`) and exit 0; with `--docs --strict` (used by change X on the scrubbed publication tree) any finding SHALL exit non-zero. The finding classes are: framing word, absolute local path (an absolute path under a user home directory on macOS, Linux or Windows, as matched by the checker), deployed-host example (a tunnel-service or deployed-service host name, as listed in the checker), and a reference to an internal-only path.

#### Scenario: Framing word in README
- **WHEN** `README.md` contains a framing word
- **THEN** `node scripts/check-repo-rules.mjs --prose` reports file and line and exits non-zero

#### Scenario: Docs mode reports but does not block development
- **WHEN** `plans/00-overview.md` contains an absolute local path and `node scripts/check-repo-rules.mjs --docs` runs in the development tree
- **THEN** the finding is printed as `DOCS-HYGIENE plans/00-overview.md:<line> absolute-path` and the exit code is 0

#### Scenario: Docs mode blocks the publication tree
- **WHEN** the same finding exists and `node scripts/check-repo-rules.mjs --docs --strict` runs on the publication tree
- **THEN** the exit code is 1

### Requirement: Internal-only path registry
`scripts/internal-paths.json` SHALL list every path that exists for development only and is removed from the published commit: `.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, `scripts/internal-paths.json`, plus the planning working files that have a neutral published replacement or are never published: `plans/evidence/`, `plans/questions-inbox/`, `plans/owner-questions.md`, `plans/manual-steps.md`, `plans/06-amendments-applied.md`. The folders `plans/` and `openspec/` as a whole SHALL NOT be listed (decision Q16: they are published as scrubbed project documentation), and no `.gitignore` or `.gitattributes export-ignore` rule SHALL hide them. The header and file-shape checks SHALL skip the listed paths; the prose and docs checks SHALL skip only the listed paths.

#### Scenario: Planning folders are not internal
- **WHEN** `node -e "const p=require('./scripts/internal-paths.json').paths; console.log(p.includes('plans/'), p.includes('openspec/'))"` runs
- **THEN** it prints `false false`

#### Scenario: Agent configuration stays internal
- **WHEN** the same command checks for `.claude/` and `CLAUDE.md`
- **THEN** both are present in the list

#### Scenario: Listed working files are skipped
- **WHEN** `plans/questions-inbox/ABUX-questions.md` contains an absolute local path
- **THEN** the docs check ignores it because the folder is listed
