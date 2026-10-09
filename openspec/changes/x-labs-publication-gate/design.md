## Context

Publication rules come from the labs publication skill (`SKILL.md` Steps 1-4, `scripts/ossify.mjs`, `scripts/gate.mjs`, `scripts/policy.json`), summarised in change A's design (E1-E8). The development repository keeps full history, planning working files and agent configuration; the public repository must be a single clean commit of the product plus its design documentation (`plans/`, `openspec/`, scrubbed - owner decision Q16, 2026-10-09). Agent configuration, internal tooling and raw working notes never leave the development repository. The private `policy.json` lists customers and internal identifiers and must never leave the private tooling; the gate reads it from its own directory.

## Explore findings

**E1. Verified behaviour of the tools (run in a scratch directory, 2026-10-08, installed labs tooling).**
- First `ossify --repo . --apply --year 2026` on a tree with one `.ts`, one `.sh`, three `.md` and one `package.json` reported `1 package.json renamed`, `2 headered`, wrote `LICENSE`, renamed `ai-assistant-service` -> `@commercetools-labs/ai-assistant-service`, and placed the shell header after the shebang followed by a blank line.
- Re-running as a dry run reported `0 package.json renamed`, `0 headered`, `2 already had SPDX`, `0 FOREIGN COPYRIGHT`, and `1 no comment style` (the new extension-less `LICENSE` file; harmless). So ossify is idempotent.
- `gate.mjs --repo .` on a one-commit repo containing `LICENSE`, `SUPPORT.md`, `CONTRIBUTING.md` printed `commit <sha>  <subject>`, `history 1 commit(s)`, `files <n>`, `0 failure(s), 0 warning(s)`, then `CLEAR.` with exit code 0.
- `gate.mjs` refuses to run on a dirty working tree (exit 2) and scans the published commit plus all ancestors (labs-publish `SKILL.md` Step 3; `gate.mjs` header comment).

**E2. Gate coverage that X must satisfy** (from `gate.mjs`/`policy.json`, see A design E4-E6): secrets (no override), 62 customer/prospect names (FAIL), internal infrastructure patterns (FAIL), foreign copyright and nested LICENSE dirs (FAIL), forbidden files `.env .env.local *.pem *.p12 *.key service-account*.json .npmrc` (FAIL), missing SPDX on `.ts .tsx .js .jsx .mjs .cjs .swift .kt .java` outside generated paths (FAIL), missing `LICENSE`/`SUPPORT.md`/`CONTRIBUTING.md` (FAIL), `package.json` name not `@commercetools-labs/...` (FAIL), ambiguous names and sales-framing words (WARN, blocks until `--ack`; applies to Markdown too, so planning text must avoid the words). Generated-path exemptions include lockfiles, `public/`, `dist/`, `build/`, `types/generated/`.

**E3. Lockfiles keep the old package name and that is fine.** After renaming `package.json` to `@commercetools-labs/ai-assistant-service`, a stale `"name": "ai-assistant-service"` remains in `package-lock.json`; `npm ci` still succeeded with exit 0 (npm 10 on Node 22.21.1, scratch test 2026-10-08). `yarn.lock` carries no package name. The anonymous proof re-verifies this for every package.

**E4. `git archive` is the right primitive.** `git archive HEAD` emits only committed tracked files, honours `.gitattributes export-ignore`, and contains no `.git` directory, so untracked `.env` files, ignored build output and stash content cannot enter. The labs skill's literal Step 2 (`rm -rf .git && git init` in a fresh clone) is equivalent but destroys the clone's history on the same disk; using an archive keeps the development repository untouched and makes the step repeatable.

**E5. Known leak sources of the legacy code (must be absent in the new repo, verified by the leak check).** Classes only; concrete tokens live in the private pattern list, never in this document: tunnel and deployed-service hosts and a local dev port in the legacy `headers.csp.script-src` of the two MC app configs; a hard-coded Merchant Center path with a store key and a product UUID in the legacy view's development host path; committed `.env` files with real ids and a dead tunnel URL; a Google site-verification HTML file in a build output; internal planning and presentation files, agent folders, scratch folders and stream logs of the legacy repositories; the legacy trust in a browser-sent `?userEmail=` (replaced by change D: administrators are decided only by `ADMIN_USER_IDS` against the signed gateway JWT user id; `ADMIN_USER_IDS` is a public, documented configuration key and is deliberately NOT on the block list); the `GECX` bootstrap (gate review pattern); two customer-scenario identifiers named in the plan brief for this change (kept only in the private list); the impersonation-key setting name (a gate-internal pattern). Everything the plans and specs themselves say about these classes must be rewritten by the scrub (E9).

**E6. Connector publication path.** The staged connector repository URL and tag are the public repo (`connectorstaged create --repository-url https://github.com/commercetools/ai-assistant.git --repository-tag v0.1.0`), which is why the tag is manual step M13 after the repo exists; before that, rehearsals use a private staging repository (change U, M15). Source: change U design E8.

**E7. Org prerequisites.** The `commercetools-labs` custom property must exist in the `commercetools` org (the PATCH returns 422 otherwise, labs-publish Step 4); creating the repo needs org rights. These are M2 and M1.

**E8. Why the removal list lives in `scripts/internal-paths.json`.** Single source from change A; the publication script and A's checkers read the same list, so a new internal path cannot be forgotten in one place. After owner decision Q16 the list names agent configuration, internal tooling and planning working files, but NOT `plans/` or `openspec/` as wholes.

**E9. What a scan of the planning documents finds today (2026-10-09 survey of this repository).** Absolute local paths of the development and legacy checkouts in task commands and "Explore findings"; citations of legacy files with line numbers (`L:` prefixes, `file:line`); source-map tables whose first column lists legacy file names; names of the two private legacy repositories and of the internal organisation; deployed-host and GCP-project examples in the deployment and E2E changes; owner-addressed phrases ("ask the owner", "owner approval", "owner decision") and manual-step ids addressed to one person; references to the evidence folder and the question inboxes; the agent configuration and internal tooling path names; the three gate framing words in rule descriptions; checkbox task lists with internal timestamps in changelogs. The scrub (D-X10) and the neutral replacement documents (D-X11) exist because of this survey. The gate WARNs on framing words and FAILs on the gate-internal identifiers for Markdown as for code; Markdown needs no SPDX header (the required-header rule covers only code extensions), but a `Copyright (c)` line of another holder inside quoted text would still FAIL the foreign-copyright check, so quoted legacy license text is deleted, not kept.

## Glossary

- **Publication directory (`$PUB`)**: the temporary tree (default `$HOME/labs-publish/ai-assistant`) that becomes the public repository's only commit.
- **Internal path**: development-only path listed in `scripts/internal-paths.json`.
- **ossify / gate / policy.json**: private labs tooling (see change A).
- **Leak check**: our repo-specific scanner on top of the gate; block list + review list.
- **WARN acknowledgement (`--ack`)**: explicit human acceptance of gate warnings; never clears a FAIL.
- **Anonymous clone**: a clone made into an empty directory with a scrubbed environment, to prove the repo builds for anyone.
- **Rename redirect**: GitHub keeps a repo name reserved after deletion until it is fully gone, which makes recreate-after-leak slow.
- **M1/M2/M12/M13**: prerequisites for creating the repo, the org property, maintainer approval and the release tag.
- **Scrub**: the scripted rewrite of `plans/` and `openspec/` on the publication copy that makes them publishable (D-X10).
- **Neutral replacement documents**: `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md`, written by hand in the development repository from the person-addressed working notes (D-X11).

## Source map

| Legacy / dev file | Published file | Verdict |
|---|---|---|
| `plans/00-05*.md`, `plans/04-workflow.md` | same | KEEP, scrubbed (D-X10) |
| the three person-addressed working notes of `plans/` (questions list, manual-steps list, amendments log; see D-X11) | `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md` | CHANGE (hand-written neutral replacements, D-X11); originals stay internal |
| `plans/questions-inbox/**`, `plans/evidence/**` | none | DROP (internal working files) |
| `openspec/changes/archive/**`, `openspec/specs/**`, `openspec/config.yaml` | same | KEEP, scrubbed |
| `openspec/changes/x-*`, `z-*` | same (active) | KEEP, scrubbed; Z archives them after the release |
| `.claude/**`, `CLAUDE.md` | none | DROP (internal agent config) |
| `scripts/labs-gate.sh`, `scripts/internal-paths.json`, `scripts/internal/**` | none | DROP |
| `scripts/spdx-check.mjs`, `scripts/check-repo-rules.mjs`, `scripts/check-connect-layout.mjs`, `scripts/connect/**`, `scripts/tests/**` | same | KEEP (public helpers) |
| `LICENSE`, `README.md`, `SUPPORT.md`, `CONTRIBUTING.md` | same | KEEP (LICENSE rewritten by ossify, identical text) |
| all `package.json` | same | CHANGE (scope by ossify, repository metadata added) |
| legacy `.env`, `.connect/*.log`, stream logs, scratch and agent folders, internal planning and presentation files of the legacy repositories | none | DROP (never copied; leak check proves it) |
| (new) | `scripts/internal/prepare-publish.mjs`, `scrub-docs.mjs`, `leak-check.mjs`, `leak-patterns.json`, `anon-proof.sh` | new, internal-only |

## Decisions

**D-X1. Build from `git archive`, in a separate directory.** Alternative: the skill's `rm -rf .git && git init` in a fresh clone (E4). Chosen for repeatability and so the development history survives.

**D-X2. Leak check is internal-only, loads customer names at run time and scans the documentation too.** The pattern file holds identifiers (a store identifier, a research-firm name, project ids) that would themselves leak if published, so it sits under `scripts/internal/` (removed from the tree) and customer names are read from the private `policy.json` rather than duplicated. Every pattern is written with a character-class escape (`ngro[k]`) so that no pattern line matches itself, and no document of this repository quotes a concrete token. Alternative: add the tokens to the private `policy.json` - the cleanest long-term answer, requested as a follow-up to the tooling maintainers (open question XQ3), but not blocking.

**D-X3. `plans/` and `openspec/` are published (Q16 DECIDED 2026-10-09); `.claude/`, `CLAUDE.md` and internal tooling stay internal.** The planning and specification files document the design and are valuable to adopters. Consequence: they are subject to the same leak check and gate as code (E9), which is why this change adds the scrub (D-X10), the neutral replacement documents (D-X11) and a docs-hygiene check (change A, `--docs --strict`). This very change's text therefore must not quote concrete leak tokens (D-X2). Alternative (earlier default): remove both folders - rejected by the owner.

**D-X4. The gate is the last gate, not the only one.** Order: archive and prune internal paths -> SCRUB -> ossify -> A's checkers (including `--docs --strict`) -> leak scan over all files -> `openspec validate --all --strict` -> commit -> gate -> anonymous proof -> maintainer approval -> publish. Alternative: only run the gate - rejected (gate does not know our repo-specific tokens, and a gate failure after commit forces a rebuild). The scrub runs before ossify because ossify must see the final Markdown (it skips Markdown for headers but repoints repository URLs).

**D-X5. Fix by rebuild, never by fix-up.** Any finding is fixed in the development repo (owning change) and the whole procedure re-run; ancestors of a published commit are public (labs-publish Step 2). The scrub is the only code that edits documents, and only inside `$PUB`; a text that is wrong to publish (internal rationale about private repositories, person-addressed text that no substitution can neutralise) is rewritten in the development repository when the scan reports it, so the development copy and the published copy converge.

**D-X6. Anonymous proof uses a local clone of the single commit plus a scrubbed environment (`env -i`).** A clone from GitHub is repeated after publication (post-publish verification). Alternative: only post-publish - rejected, a broken build would already be public.

**D-X7. Repository metadata is added in X, not earlier.** The final repo name (Q10) is only certain at publication; ossify repoints GitHub URLs if present, X adds them with the final value.

**D-X8. Commit author = the configured corporate identity of the person publishing**, message neutral (no internal repo names, no customer names, no "multitenant"). Alternative: a bot identity - rejected, no such identity exists. Owner may override (XQ2).

**D-X9. Rollback = delete and recreate.** Per labs-publish Step 4: a force-push does not remove commits that were public; deletion plus recreation is the only fix, plus credential rotation.

**D-X10. The scrub: mechanical substitutions plus a human-rewrite report, run on `$PUB` by `scripts/internal/scrub-docs.mjs`.** Targets: every `*.md`, `*.yaml`, `*.json` under `plans/` and `openspec/`. Substitution table (applied in this order, each counted per file in the report):

| # | Matches | Becomes |
|---|---|---|
| 1 | the development checkout root path | `<repo>` |
| 2 | any other absolute local path of a user home directory (macOS, Linux, Windows) with an optional `:line[-line]` suffix, and bare names of the private legacy repositories | `the legacy multitenant implementation (not public)` |
| 3 | citations `L:` + path, `(file:line)` of legacy files | removed, or the file's base name in parentheses when it carries meaning |
| 4 | source-map table header "Legacy file ..." | `Origin`; cells reduced to a neutral description |
| 5 | the internal organisation and the publication-organisation names | `an internal commercetools organisation` |
| 6 | tunnel hosts and deployed-service hosts, GCP project ids from the private list | `https://service.example.invalid`, `<gcp-project-id>` |
| 7 | the agent configuration folder, the agent instructions file, the internal gate wrapper, path manifest and tooling folder | `<agent-config>/`, `<agent-instructions>`, `<internal-gate-wrapper>`, `<internal-path-manifest>`, `<internal-tooling>/` |
| 8 | run-evidence folder and question-inbox references | `<run-record>/`, `the working notes (not published)` |
| 9 | the three working-note file names | `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md` |
| 10 | the role word for the person who decided or approves (person-addressed phrases such as "ask ...", "... decision", "... approval") | `the maintainer`, `a maintainer` |
| 11 | the three framing words | `sample`, `prototype`, `sales-engineering` (report lists every line for review because a rule description changes meaning) |
| 12 | personal and corporate e-mail addresses | `maintainer@example.invalid` |

After the substitutions the script re-scans with the block list and prints `NEEDS-HUMAN path:line reason` for: remaining block hits; inbox-local question ids (pattern `\b[A-Z]{1,3}Q-?[A-Z0-9]*\d+\b` not defined in `plans/decisions.md`); `file:line` citations left over; sentences addressed to a named person. Rule for internal rationale: wherever a decision is justified by something in a private repository, the text is rewritten in the development repository as a neutral statement of the behaviour or constraint ("the earlier implementation trusted a browser-supplied address") with no path, repository name or quote. The table is data in the script, covered by unit tests.

**D-X11. Hand-written neutral replacement documents, not generated.** The questions list, the manual-steps list and the amendments log in `plans/` are addressed to one person and carry inbox ids; generating neutral text from them would hide judgement calls. By the time X runs every question is decided, so a maintainer writes `plans/decisions.md` (id, decision, rationale, affected changes), `plans/prerequisites.md` (id, prerequisite, role that provides it, details) and `plans/design-history.md` (corrections and amendments table) once, keeping ids (`Q16`, `M12`) so references from the specs stay valid; change-local question ids of the form letter, `Q`, number are not carried over. They are listed as published; the three originals are listed in the internal path manifest. Alternative: delete them and strip every reference - rejected, the specs cite them hundreds of times.

**D-X12. Checkboxes, archive and `plans/evidence/` (decisions for the published copy).** Task checkboxes are published as they stand (all ticked once implemented and archived; X and Z unticked), no status line or timestamps added: the files are a record, not a dashboard. All changes except X and Z are archived with spec sync before publication, so `openspec/specs/` is complete and `openspec/changes/archive/**` is published after the scrub; `openspec/changes/.gitkeep` remains; Z archives X and Z in the public repository. `plans/evidence/` is NOT published (screenshots, network logs and transcripts can contain project data); if the docs need a result, the neutral summary goes into the docs as a table, never a link into the folder.

**D-X13. Gate behaviour for Markdown.** The gate's SPDX rule covers code extensions only, so Markdown needs no header; its content scans (secrets, customer names, internal identifiers, foreign copyright, framing words) do run over Markdown. Hence the scrub replaces framing words and the leak scan must show zero BLOCK. WARNs that remain (for example the review word `tenant` inside design history) are acknowledged with a one-line reason each in the publication record.

## Risks / Trade-offs

- [A leak the gate and our list both miss] -> four independent scans (scrub NEEDS-HUMAN report, private gate, leak list over all files including `plans/` and `openspec/`, human read of the `git add --dry-run` listing and of the scrub report by a maintainer at M12)
- [A substitution changes the meaning of a rule description (for example the framing words)] -> every substitution of that class is listed in the report and read by a person; rewrites that matter are made in the development repository
- [Scrub breaks OpenSpec structure] -> `openspec validate --all --strict` runs on the scrubbed tree as the last check before the commit; credentials in the repo are impossible by construction because `.env*` is never tracked and the secret patterns run in the gate.
- [WARN acknowledgements become habit] -> each `--ack` is recorded with a reason in the run record; a maintainer sees the list at M12.
- [Ossify changes files after the anonymous proof] -> the proof runs on the final single commit, not before.
- [Build breaks only after scrub] -> the proof is mandatory and the labs skill states the same ("a repo nobody has run since the scrub has an unknown number of scrub-induced breakages").
- [Internal path list incomplete] -> `find` assertions on the tree for the known folders plus the leak check on content; new internal folders must be added to `scripts/internal-paths.json` (checker in A skips them, so they stay invisible to the prose checks but are removed here).
- [`npm ci` rejects a stale lockfile name in a future npm] -> E3 verified today; the proof is the canary.
- [The year in headers] -> `--year "$(date +%Y)"` at publication; `LICENSE` and every header get the same year.

## Migration Plan

1. Freeze: all other changes archived (X and Z stay active); the three neutral replacement documents written; `main` clean. 2. Run the scripted preparation (idempotent, repeatable): archive, prune, scrub, ossify, checks. 3. Review the saved run record (scrub report, ossify report, dry-run listing, leak report, gate output, proof log). 4. Maintainer approval (M12). 5. Create the public repo and push (M1, M2). 6. Verify from GitHub. 7. Tag later (M13, change Z). Rollback: section "Post-publication verification and rollback" of the spec.

## Open Questions

- **XQ1 (refines Q16): DECIDED 2026-10-09** - `plans/` and `openspec/` stay in the published repository, scrubbed (D-X3, D-X10); `.claude/` and `CLAUDE.md` are removed.
- **XQ2 (maintainer):** commit author identity and message wording; default: publishing person's configured identity, neutral message drafted in task 5.2.
- **XQ3 (tooling maintainers):** add the repo-specific tokens to `policy.json` so the internal leak list can shrink; default: not requested, internal list used.
- **XQ4 (Q10): DECIDED 2026-10-09** - repository `commercetools/ai-assistant`; description text as in task 9.2.
- **XQ5:** header year - publication year; default as stated.

## Changelog

- 2026-10-09: owner decisions. (1) `plans/` and `openspec/` are published as scrubbed documentation (Q16): new decisions D-X10 (scrub), D-X11 (neutral replacement documents), D-X12 (checkboxes, archive, evidence), D-X13 (gate behaviour for Markdown), E9 survey, D-X3/D-X4/D-X5 rewritten, new spec requirements for the scrub, replacement documents, task status/archive and post-scrub validation, new tasks section 3 and renumbered sections 4-9. (2) Admin model: administrators are decided by `ADMIN_USER_IDS` (public configuration key, not on the block list); the legacy `?userEmail=` trust remains a recorded leak source (replaces the earlier e-mail-model bullet). (3) The leak patterns are no longer quoted in this change (character-class escapes, private list), XQ1 and XQ4 closed.
