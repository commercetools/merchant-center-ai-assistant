## Why

Change **X** (`x-labs-publication-gate`, Wave 10, Needs: W, V) turns the finished internal repository into a **public `commercetools-labs` repository** (`commercetools/ai-assistant`): MIT license, SPDX headers, `@commercetools-labs/*` package names, scrubbed design documentation (`plans/`, `openspec/`), no history, a clean run of the blocking gate, and a proof that an anonymous clone builds. Publishing is irreversible (a force-push does not remove commits that were once public), so the procedure is scripted, repeatable and reviewed once by a maintainer (M12) before the only manual, irreversible action (M1).

## What Changes

- Add an internal-only publication toolkit under `scripts/internal/` (never published): `prepare-publish.mjs` (builds the publication directory from **tracked files only**, prunes internal paths, runs ossify, checks), `leak-check.mjs` + `leak-patterns.json` (repo-specific leak list on top of the private gate), and `anon-proof.sh` (clean-clone build/typecheck/test).
- Run `ossify` in dry-run, review, then `--apply`; add repository metadata to every `package.json`.
- Remove from the publication tree the internal paths of the manifest: agent configuration, agent instructions file, internal gate wrapper, internal tooling, the manifest itself, and the planning working files (run evidence, question inboxes, person-addressed question and step lists, amendments log); assert that no `.github/workflows` exists. `plans/` and `openspec/` STAY (Q16, decided 2026-10-09).
- **Scrub** the published `plans/` and `openspec/` on the publication copy (`scripts/internal/scrub-docs.mjs`): replace absolute local paths and private-repository names with the phrase "the legacy multitenant implementation (not public)", rename source-map columns to "Origin", neutralise person-addressed wording and framing words, and publish hand-written neutral `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md` instead of the working notes; run `openspec validate --all --strict` on the scrubbed tree.
- Archive every change except X and Z with spec sync before publication; publish checkboxes as they stand.
- Strip history: fresh `git init -b main`, `git add --dry-run .` review, **one commit**.
- Run the private `gate.mjs` on that commit until it prints `CLEAR`; read every WARN before using `--ack`.
- Prove it runs: clone the single commit into a clean directory and run install, typecheck, tests and build for all packages plus `commercetools connect validate`.
- Document the repository-creation commands (labs-publish Step 4) as **manual steps M1, M2, M12**, the post-publication verification, and a rollback procedure.

## Capabilities

### New Capabilities
- `labs-publication`: How the public tree is produced and verified: tracked-only archive, internal-path pruning, ossify, leak check, single-commit history, gate, anonymous-clone proof, public-first publication and rollback.

### Modified Capabilities
<!-- none -->

## Impact

- New internal-only files: `scripts/internal/**` (including `scrub-docs.mjs`). New published files: `plans/decisions.md`, `plans/prerequisites.md`, `plans/design-history.md`. The published tree contains none of them.
- Reads `scripts/internal-paths.json` (change A) and the wrappers from A; the private `policy.json` is read at run time from `LABS_PUBLISH_DIR` and never copied.
- Produces a publication directory outside the development repo (default `$HOME/labs-publish/ai-assistant`) and leaves the development repository and its history untouched.
- Needs manual steps M1 (create public repo), M2 (org property), M12 (maintainer approval of LICENSE holder text, README banner, internal-path removal and the scrub report).

## Legacy source

Read-only. Consulted only to build the leak list (nothing is copied): the legacy multitenant implementation (not public) - the MC app and custom-view configuration files (tunnel and deployed-service hosts in their CSP, a hard-coded store/product path), its ignore files, and its internal planning and documentation files - and section 4 of `plans/01-source-inventory.md` in this repository ("Things copied nowhere"). Concrete tokens are kept in the private list (design D-X2), never in this document.

## Out of scope

- Any product change. If the gate or the proof finds a defect, the fix is made in the development repo (the owning change) and the publication is rebuilt from scratch; X never hand-edits the publication directory.
- Release tag, Connect production readiness, handover (change Z; tag step is manual step M13; Z also archives X and Z in the public repository).
- Marketing, announcement, GitHub repo settings beyond the labs property and `labs` topic.
- Creating or modifying `policy.json`; asking the private-tooling maintainers to add new names is a request, not part of this change.
