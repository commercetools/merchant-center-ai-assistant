## Why

Change **A** (`a-repo-bootstrap-labs-compliance`, Wave 0, Needs: nothing) lays the compliance foundation every later change builds on. The finished repository must be published as a `commercetools-labs` project (MIT, SPDX header in every source file, "unsupported" wording three times, `@commercetools-labs/<name>` package names, no GitHub Actions). Retrofitting those rules at the end (spec X) is how leaks and missing headers happen, so A installs the rules, the root files and the local check tooling on day one, and every later change inherits a repo where `node scripts/spdx-check.mjs` and `node scripts/check-repo-rules.mjs` already run.

## What Changes

- Add root files: `LICENSE` (MIT, holder text identical to what `ossify.mjs` writes), `README.md` (with the "unsupported" banner), `SUPPORT.md`, `CONTRIBUTING.md`, `.gitignore`.
- Add `scripts/spdx-check.mjs` (SPDX header + package-name check, mirrors the publication gate's `requireSpdx`/`generated` rules without needing the private policy).
- Add `scripts/check-repo-rules.mjs` (no CI/Docker/Terraform files, forbidden files, `.env.example` value policy, prose hygiene for the gate's framing words, and a `--docs` mode that also lints the published `plans/` and `openspec/` Markdown).
- Add `scripts/labs-gate.sh`: thin local wrapper that calls the private `ossify.mjs` / `gate.mjs` by path through the `LABS_PUBLISH_DIR` environment variable. `policy.json` is never copied into this repo.
- Add `scripts/internal-paths.json`: the single list of paths that exist for development only (`.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, itself, and the planning working files `plans/evidence/`, `plans/questions-inbox/`, `plans/owner-questions.md`, `plans/manual-steps.md`, `plans/06-amendments-applied.md`) and must be absent from the published commit (consumed by spec X). `plans/` and `openspec/` themselves are NOT internal: they are published as scrubbed design documentation (decision Q16, 2026-10-09).
- Codify package-naming rules (`ai-assistant-service`, `ai-assistant-mc-app`, `ai-assistant-composed-apps`, `ai-assistant-mc-view-app`; ossify adds the `@commercetools-labs/` scope) and the "no `.github/workflows`" rule.

## Capabilities

### New Capabilities
- `repo-compliance`: Root licensing/support files, "unsupported" wording, SPDX tooling, package-naming rules, env/secret hygiene, no-CI rule, local wrappers around the private publication tooling, and the internal-only path registry.

### Modified Capabilities
<!-- none: openspec/specs/ is empty -->

## Impact

- New files only at repo root and `scripts/`. No application code, no `connect.yaml` (that is change B).
- Every later change must run `node scripts/spdx-check.mjs` and `node scripts/check-repo-rules.mjs` as part of its Definition of Done (plans/04-workflow.md section 4).
- Spec X consumes `scripts/internal-paths.json` and the wrappers; spec W extends README/CONTRIBUTING but must keep the banner.

## Legacy source

Read-only, never modified. Nothing is copied wholesale; these are consulted for what to DROP or merge:

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/.gitignore` and the per-app `.gitignore` files (merge into one root `.gitignore`)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.gitignore`
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/LICENSE` (DROP; root `LICENSE` replaces it)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.github/` (DROP entirely, requirement R6)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/netlify.toml` (DROP)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/.env.example` and the three frontend `.env.example` files (rules only; the real files are rewritten by C/O)

## Out of scope

- `connect.yaml`, app folders, package manifests (change B).
- Running `ossify --apply`, history strip, `gate.mjs` clean run, repo creation (change X). A only provides the wrappers and runs ossify in dry-run mode.
- README body, architecture docs, config reference (change W).
- Any application code or tests of application behaviour.
- Creating the GitHub repository or the `commercetools-labs` org property (manual steps M1/M2, owned by X).
