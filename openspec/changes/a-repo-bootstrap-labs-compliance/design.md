## Context

The target repo (`/Users/behnam/code/commercetools-labs/ai-assistant`) currently holds only planning material (`plans/`, `openspec/`, `.claude/`); `plans/` and `openspec/` are later published as scrubbed documentation (D-A8). Change A makes it a compliant `commercetools-labs` skeleton before any code arrives. The publication tooling (`ossify.mjs`, `gate.mjs`, `policy.json`) lives in a private plugin; `policy.json` enumerates customers and must never be copied into this repo. A therefore ships (a) public, self-contained checks that mirror the mechanical rules, and (b) a thin local wrapper that calls the private tools by path.

## Explore findings

Facts were verified by reading the files below on 2026-10-08. "labs-publish" = the labs publication skill (`SKILL.md`, `scripts/ossify.mjs`, `scripts/gate.mjs`, `scripts/policy.json`).

**E1. Holder text and header.** `ossify.mjs` constants: `HOLDER = 'commercetools GmbH and the commercetools-labs contributors'`, `SPDX = 'MIT'`, `DISCLAIMER = 'Freely available, AS IS and UNSUPPORTED. See LICENSE.'`; the three header lines are `SPDX-License-Identifier: MIT`, `Copyright (c) <year> <HOLDER>`, `<DISCLAIMER>`. Block comment for `.ts .tsx .js .jsx .mjs .cjs .mts .cts .css .scss .java .kt .kts`, line comments for `.swift` (`// `), `.graphql` and `.sh` (`# `). A shebang stays on line 1. The LICENSE text written by `--apply` is the standard MIT text with `Copyright (c) <year> <HOLDER>` (see `LICENSE_TEXT` in `ossify.mjs`). `--year` defaults to the current year.

**E2. What ossify skips.** `SKIP_EXT`: `.json .lock .md .svg .png .jpg .jpeg .webp .gif .ico .woff .woff2 .ttf .otf .pdf .zip .mp4 .snap .txt .yaml .yml .toml .xcworkspacedata .pbxproj .plist .xcscheme`. `SKIP_DIRS`: `.git node_modules public dist build coverage .next .turbo .netlify Pods .build DerivedData .venv __pycache__`. Consequence: **never put source code in a directory named `public`, `build`, `dist` or `coverage`** (ossify would not header it, but `gate.mjs` would not forgive a missing header outside its `generated` list either). `.gitkeep`, `.gitignore`, `.env.example`, `.nvmrc` have no style and are reported under "no comment style" (harmless).

**E3. Foreign copyright refusal.** ossify refuses a file whose first 2000 characters contain `Copyright|(c)` + year naming something other than `commercetools`, and does not descend into any directory containing its own `LICENSE`/`LICENCE`/`COPYING` or a `metadata.json` naming another org. `gate.mjs` turns both into FAIL (`third-party subtree`, `foreign copyright`). Consequence: copying a legacy file that carries `service/LICENSE`-style notices, or letting a generator drop a `LICENSE` into a subfolder (the `commercetools connect init` template does write a root `LICENSE` with holder `commercetools`, observed 2026-10-08 in a scratch `connect init --template tax-integration`), must be handled deliberately.

**E4. What the gate requires.** `gate.mjs` checks: forbidden files (`policy.forbiddenFiles`: `.env`, `.env.local`, `*.pem`, `*.p12`, `*.key`, `service-account*.json`, `.npmrc`), SPDX header in the first 600 chars for extensions `.ts .tsx .js .jsx .mjs .cjs .swift .kt .java` excluding `policy.generated.paths` (`package-lock.json yarn.lock pnpm-lock.yaml schemas/ src/types/generated/ types/generated/ public/ dist/ build/ .next/`, matched as substring for paths ending in `/`), required files `LICENSE SUPPORT.md CONTRIBUTING.md`, every `package.json` `name` must start with `@commercetools-labs/` (a package without `name` passes), then content scans of the tree and every ancestor commit. Note `.d.ts` files count as `.ts`, so `@types-extensions/*.d.ts` and `jest.d.ts` in the frontends need headers. Shell scripts (`.sh`) are headered by ossify but not required by the gate; A requires them anyway because ossify will add them and an unheadered `.sh` would make `ossify --apply` produce a diff after a "clean" run.

**E5. Warn-level content rules that affect prose.** `policy.framing.patterns` holds three word-boundary patterns for sales-style framing words (WARN, blocks until `--ack`); the words are deliberately not spelled out here because this document is published and scanned. `policy.internal.patterns` lists internal tool, host and identifier names (FAIL); they are not reproduced here. `policy.review.patterns` includes a word-boundary pattern for the legacy widget bootstrap word (WARN) - the legacy router has a widget bootstrap that D10/Q7 drops. The generic framing words are safe to encode in a public checker; the private names are not and are therefore **not** copied (spec X owns a non-published leak list).

**E6. Secret patterns that constrain `.env.example`.** `policy.secrets.patterns` FAIL (no override) on quoted literals of 20+ chars after keys containing `token|secret|password|passwd|credential|api_key|auth_token|bearer`, on 32+ char quoted hex literals, and on `CLIENT_SECRET|CTP_CLIENT_SECRET|SESSION_SECRET` unquoted values of 16+ chars, unless the value starts with `replace|change|your|example|todo|fixme|placeholder|dummy|sample|redacted|none|null|xxx|${|<`. Safest policy for examples: empty values for anything secret-shaped. Tests and fixtures must also avoid long quoted literals next to such key names.

**E7. Naming.** `ossify` rewrites `pkg.name` to `@commercetools-labs/` + the part after any existing scope, and repoints `homepage`, `repository`, `bugs` GitHub URLs to org `commercetools`. So a dev-time name `ai-assistant-service` becomes `@commercetools-labs/ai-assistant-service` (matches Q10). Source: `ossify.mjs` "package names" block.

**E8. Publication procedure facts used later.** labs-publish Step 2: `rm -rf .git && git init -b main`, `git add --dry-run .` read before add, one commit. Step 3: gate scans the commit being published plus ancestors and refuses a dirty tree. Step 4: create the repo public from the start; verify from an anonymous clone with `npm ci && npm run typecheck && npm test && npm run build`. Source: labs-publish `SKILL.md`.

**E9. Official Connect repo-shape rules.** `connect.yaml` at repo root; app folders are root siblings named exactly like `deployAs[].name`; **no npm workspaces root** (a root `package.json` is only a tooling hub); shared code is a plain folder imported by relative path (commercetools-connect skill, `references/monorepo-with-storefront.md` Patterns 1-2 and `references/project-structure.md` Pattern 3). Consequence for A: the repo has no root `package.json` with `workspaces`; A adds none at all (the scripts run with plain `node`).

**E10. Scaffold leftovers.** A scratch `commercetools connect init sample-conn --template tax-integration` (CLI `@commercetools/cli/0.0.17`, Node 22.21.1) produced `.github/CODEOWNERS`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.idea/`, `.cm/`, a root `LICENSE` and an old-style `inheritAs.configuration` block. Any use of `connect init` or `connect application add` therefore requires the A rule "no `.github/`" to be re-checked (`check-repo-rules.mjs`). Docs: <https://docs.commercetools.com/connect/cli.md>.

**E11. Legacy ignore files.** Legacy `.gitignore` files ignore `node_modules coverage .terraform *.tfstate* *.tfvars .DS_Store .vscode build/ .env public/ .connect docs/.drive-docs`; the router also ignores `data/ env.yaml service/.devtools/generations.json .clinic/ *.log`. In the chat-app the `public/` folder of each MC app is entirely untracked (`git ls-files mc-app/public` is empty), i.e. `public/` is pure build output including a stray `google*.html` verification file that must not be copied. The legacy `.connect/` folder holds Buildpack `project.toml` and SAST logs; B decides what to keep.

## Glossary

- **labs-publish**: the internal skill/procedure that turns a repo into a public `commercetools-labs` repo (ossify -> history strip -> gate -> push).
- **ossify**: private script that writes `LICENSE`, adds SPDX headers and renames packages. "Dry run" = no `--apply`.
- **gate**: private blocking pre-publication scanner (`gate.mjs`); reads the private `policy.json`.
- **policy.json**: private list of customer names and internal identifiers. Never copied here.
- **SPDX header**: the three-line banner identifying the MIT license and the unsupported status; travels with copy-pasted code.
- **Internal-only path**: a path that exists in the working repo for development (agent config, private wrappers, planning working files such as evidence and owner inboxes) and is removed from the published commit. `plans/` and `openspec/` are NOT internal-only: they are published after the scrub of change X.
- **Banner**: the block at the top of `README.md` stating the repo is unsupported.
- **Tooling hub**: a root `package.json` with scripts only, no `workspaces` (not used here).

## Source map

| Legacy file | New file | Verdict |
|---|---|---|
| `multitenant-ai-assistant-router/service/LICENSE` | `LICENSE` (root, ossify text) | DROP + replace |
| `multitenant-chat-app/.gitignore`, `*/.gitignore` (mc-app, composed-apps, mc-view-app) | `.gitignore` (root, merged) | CHANGE |
| `multitenant-ai-assistant-router/.gitignore` | `.gitignore` | CHANGE (merge, drop `.terraform`, `env.yaml`, `data/`) |
| `multitenant-ai-assistant-router/.github/**` | none | DROP (R6) |
| `multitenant-chat-app/netlify.toml` | none | DROP |
| `multitenant-chat-app/.connect/*`, router `.connect/*` (logs, project.toml) | decided in B | DROP logs, B decides `project.toml` |
| `*/.env`, `service/.env` | none (never copied) | DROP |
| `*/.env.example` | per-folder `.env.example` written in B/C/O under the policy of this change | CHANGE |
| `README.md` (both repos) | `README.md` (banner here, body in W) | CHANGE |
| `service/.nvmrc` (`v22.21.1`), app `.nvmrc` (`22`) | per-folder `.nvmrc` in B | CHANGE (single value `22`) |
| (new) | `SUPPORT.md`, `CONTRIBUTING.md` | new |
| (new) | `scripts/spdx-check.mjs`, `scripts/check-repo-rules.mjs`, `scripts/labs-gate.sh`, `scripts/internal-paths.json` | new |

## Decisions

**D-A1. Two public checkers instead of one monolith.** `spdx-check.mjs` (license/header/names) and `check-repo-rules.mjs` (no-CI, forbidden files, env policy, prose, README banner). Alternatives: (a) a single `repo-check.mjs` - rejected because the brief and plans/04-workflow.md already name `scripts/spdx-check.mjs` as the Definition-of-Done command, and a header-only command stays fast for pre-commit use; (b) a root `package.json` with scripts - rejected, E9 (no workspaces/hub needed, and ossify would rename it).

**D-A2. Checkers are dependency-free Node ESM (`node:fs`, `node:child_process`, `node:test`).** They must run in an anonymous clone with no install (spec X proof) and must not need the private tooling. Alternative: use `ossify --repo . ` dry-run output as the checker - rejected, it needs the private plugin.

**D-A3. Files come from `git ls-files` (tracked + untracked-not-ignored via `--cached --others --exclude-standard`).** Walking the file system would scan `node_modules`; `git ls-files` also matches what X will `git add`. Alternative: own directory walker with ossify's `SKIP_DIRS` - kept only as the fallback when not in a git repo.

**D-A4. Private tooling is reached only through `LABS_PUBLISH_DIR`.** The wrapper never hardcodes a plugin cache path (the plugin directory name is itself in `policy.internal.patterns`). Alternative: symlink or copy the scripts into `scripts/vendor/` - rejected: copying `gate.mjs` is harmless but `policy.json` is not, and a partial copy drifts.

**D-A5. Wrapper and path registry are internal-only; the checkers are public.** `scripts/labs-gate.sh` and `scripts/internal-paths.json` are removed from the published commit by X. The checkers (`spdx-check`, `check-repo-rules`) stay public: they help contributors and contain no private data (the framing words are generic; E5).

**D-A6. Unscoped names during development, scope by ossify.** Alternative: write `@commercetools-labs/...` by hand now - rejected: the brief wants ossify's rename to be the single mechanism, and an unscoped private name cannot collide with anything while the repo is private. Both forms are accepted by the checker so it keeps passing after X.

**D-A7. `.sh` headers required.** See E4. Alternative: tolerate missing `.sh` headers - rejected (ossify would change the tree after the "clean" gate run).

**D-A8. Internal-only vs published planning material (owner decision Q16, 2026-10-09).** `plans/` and `openspec/` stay in the published repository as project documentation of the design, so they are NOT in `internal-paths.json`; a scrub step in change X makes them publishable. Still internal-only: `.claude/` (agent configuration; the staged `.claude/commands/opsx/*` and `.claude/skills/openspec-*`), `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, `scripts/internal-paths.json`, and the planning working files that are addressed to one person or hold raw run output (`plans/evidence/`, `plans/questions-inbox/`, `plans/owner-questions.md`, `plans/manual-steps.md`, `plans/06-amendments-applied.md`); X publishes neutral replacements (`plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md`). Consequence for A: no `.gitignore`/`export-ignore` rule hides `plans/` or `openspec/`, and the checkers run over their Markdown in `--docs` mode (report in development, `--strict` on the publication tree). Alternative: keep both folders internal (the earlier default) - rejected by the owner.

**D-A9. Prose rule limited to the three gate framing words (constant `FRAMING_WORDS` in the checker) plus generic docs hygiene.** The words are never spelled out in these planning documents, because the planning documents are themselves published and the gate scans them. The docs mode adds generic classes only (absolute local paths, deployed-host examples, references to internal paths); names of private repositories, customers and similar are left to X's private leak list, which A must not contain. Alternative: also lint "multitenant"/"tenant" - deferred to X's leak check (legitimate in design history).

## Risks / Trade-offs

- [The wrapper cannot be exercised by CI (there is none) or by an anonymous clone] -> it is a developer convenience only; X runs the private scripts directly and records the transcript.
- [The checker's SPDX rules drift from the private gate] -> the extension and generated lists are copied verbatim from E4 into one constant block with a comment naming `gate.mjs`; spec X compares both tools' verdicts on the real tree.
- [`.env.example` value policy is stricter than the gate] -> intentional; false positives are fixed by emptying the value.
- [Prose check false positives, e.g. a verb that happens to equal a framing word] -> word-boundary match, internal paths skipped, an `// labs-allow-framing` inline escape is NOT provided (rewrite the sentence).
- [Developer forgets `LABS_PUBLISH_DIR`] -> wrapper prints the fix and exits 2; documented in CONTRIBUTING for maintainers only in generic words.
- [A generator re-adds `.github/`] -> `check-repo-rules.mjs` is part of every change's Definition of Done.

## Migration Plan

New files only. Order: license/notice files -> `.gitignore` -> checkers with tests -> wrapper -> registry -> run all checks and ossify dry-run. Rollback = revert the commit; nothing else depends on A yet.

## Open Questions

- **AQ1** (refines Q10): confirm the unscoped dev names (`ai-assistant-service`, `ai-assistant-mc-app`, `ai-assistant-composed-apps`, `ai-assistant-mc-view-app`) and the holder wording; default as stated. Mirrored in `plans/questions-inbox/ABUX-questions.md`.
- **AQ2** (refines Q16): DECIDED 2026-10-09: `.claude/` and `CLAUDE.md` are internal-only; `plans/` and `openspec/` are published after the scrub (see D-A8).
- Is the year in the headers 2026 (`--year`)? Default: the year of the publication commit (X passes `--year "$(date +%Y)"`); during development the checker accepts any four-digit year.

## Changelog

- 2026-10-09: owner decision Q16 - `plans/` and `openspec/` stay in the published repository as scrubbed documentation. `scripts/internal-paths.json` no longer lists them (it lists agent config, internal tooling and the planning working files), the checkers gain a `--docs` / `--docs --strict` mode, framing words are no longer spelled out in the change text, D-A5/D-A8/D-A9 and AQ2 rewritten, tasks 5.4 (prose), new 5.5 (docs mode), 5.6 (tests, 16 instead of 14 passing) and 7.1 revised and renumbered (see spec X for the scrub itself).
