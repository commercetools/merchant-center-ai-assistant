# 04 — Workflow: how every spec is planned, built and proven

## 1. Planning workflow (per spec, in A→Z order — one by one)

For each row of [03-spec-dependency-map.md](./03-spec-dependency-map.md):

1. **`/opsx:explore <change-name>`** — read-only investigation. Read the source files named in the spec's *Source map*, verify every "verify in explore" item in `plans/` against real code/docs (use the commercetools Knowledge MCP for platform facts), and write findings into `design.md` under **Explore findings** (facts + file/line citations; unknowns become *Open questions* and, if owner-only, an entry in `plans/owner-questions.md`).
2. **`/opsx:propose <change-name>`** (or `/opsx:ff`) — creates the change and all artifacts:
   - `proposal.md` — why, what changes, impact, out of scope.
   - `design.md` — decisions with alternatives considered, risks, migration notes, explore findings.
   - `specs/<capability>/spec.md` — normative requirements + scenarios (SHALL/MUST, WHEN/THEN).
   - `tasks.md` — the **junior-developer plan** (see §3).
3. **Validate**: `openspec validate <change-name> --strict` must pass.
4. Planning stops here. Implementation starts only on `/opsx:apply <change-name>`.

## 2. Implementation workflow (per spec)

`/opsx:apply` → work `tasks.md` top to bottom, ticking boxes → `/opsx:verify` → `/opsx:archive` (syncs delta specs into `openspec/specs/`).
Never start a spec before every spec in its **Needs** column is archived. Parallel specs in the same wave use separate git branches (`spec/<id>`), merged to `main` in dependency order.

## 3. What "detailed for a junior developer" means (checked in review)

Every `tasks.md` MUST follow this shape — the OpenSpec config (`openspec/config.yaml`) enforces it as an artifact rule:

```
## 0. Read first          (links: proposal, design, source files with paths, platform docs; "you should now be able to explain X")
## 1. Setup               (exact commands; expected output)
## N. <Group name>
- [ ] N.1 <imperative task>                       ← one task ≈ ≤ 2 hours, one commit
      **Why:** one sentence.
      **Where:** exact file paths (create/modify) and the source file to copy from (absolute path in the legacy repo).
      **How:** numbered mini-steps, code skeletons / signatures / SQL / YAML snippets where the shape is non-obvious.
      **Done when:** observable check (command + expected result, or UI behaviour).
      **Watch out:** known traps (from the legacy FEATURES/ARCHITECTURE docs).
## Last: Verification     (unit tests to add + names; Chrome E2E scenario ids from spec V; `commercetools connect validate`; gate checks)
```

Also required in each `design.md`: a **Glossary** for any term a newcomer would not know (forward-to, Managed MCP, Custom Object container, UI message stream, …) and a **Source map** table (legacy file → new file → KEEP/CHANGE/DROP).

## 4. Definition of Done (every spec)

- [ ] Code merged on its branch; `yarn typecheck && yarn lint` (frontends) / `npm run build && npm test` (service) green.
- [ ] New/changed behaviour covered by tests named in `tasks.md` (jest wire/unit tests; for frontends at least typecheck+lint+build and the Chrome scenarios).
- [ ] No `console.log`, no `any` escapes introduced, no tenant words, SPDX header present (run `node scripts/spdx-check.mjs`).
- [ ] Chrome E2E scenario(s) for the spec pass and evidence (screenshots / network log) saved under `plans/evidence/<run-id>/<scenario-id>/` (git-ignored; never published, see change X).
- [ ] `commercetools connect validate` passes (when `connect.yaml` or app folders changed).
- [ ] `node scripts/check-repo-rules.mjs` and `node scripts/check-connect-layout.mjs` pass (spec A/B tooling).
- [ ] Docs delta recorded for spec W (a bullet in the spec's `tasks.md` "Docs to update").
- [ ] `/opsx:verify` clean; change archived.

## 5. Testing without the owner (R9)

| Layer | Tool | Notes |
|---|---|---|
| Service logic | jest + supertest + msw, in-memory persistence implementation | no network; runs in `commercetools connect application test` |
| Service ↔ Custom Objects | integration test against a **scratch commercetools project** using a dev API client from `.env.local` (git-ignored) | manual step M3 provides credentials once |
| Service ↔ Gemini | one live smoke test per model (`F`), skipped when `GCP_SA_KEY_BASE64` is unset | manual step M5 |
| Frontends | `tsc --noEmit`, `mc-scripts build`, lint | all three apps |
| End-to-end UI | **Chrome DevTools MCP** (`mcp__chrome-devtools__*`): navigate, `take_snapshot`, `fill`, `click`, `wait_for`, `list_network_requests`, `list_console_messages`, `take_screenshot` | needs the Chrome profile to be **logged in to Merchant Center once** (manual step M8, once per test user: the admin user and the non-admin user, see M10); everything else is automated |
| Deployed | A **published** Connector deployed as `sandbox` (a ConnectorStaged cannot go to sandbox; dev loop = `connectorstaged preview` or stage→publish→sandbox; needs a private staging repo, M15, and Docker for `connect validate`, M14), then the same Chrome scenarios against the deployed URL (the MC gateway cannot reach `localhost`) | needs M6–M10, M14–M16 |

### Chrome scenario conventions (spec V formalises)

- Scenario id `E2E-<spec>-<nn>` (e.g. `E2E-P-03 send message streams a reply`).
- Each scenario: preconditions, steps (tool calls), assertions (DOM text via snapshot, network status via `list_network_requests`, zero console errors via `list_console_messages`), evidence file names.
- A scenario is **idempotent** and cleans up the sessions/custom objects it created (prefix test data with `e2e-`).
- LLM output is non-deterministic → assert structure (stream completes, tool part appears, no error frame), never exact wording.

## 6. Branching, commits, history

Work happens in this repo with normal commits during development. **Spec X** (labs publication) squashes to a single clean commit on a fresh `git init` per the labs publish procedure — so do not put secrets, customer names or internal hostnames in *any* commit, even temporarily (the gate scans ancestors).

## 7. Order of authoring the 25 changes

Plans are authored in letter order (A…Z skipping Y); each later spec's *explore* may amend an earlier spec's design if a fact proves wrong — amend via `/opsx:update <earlier-change>` and note it in `design.md` § Changelog.
