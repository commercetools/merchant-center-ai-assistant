## Why

Change **Z** (`z-release-verification`, wave 11, the last change) is the final acceptance of the whole migration. It does not add features. It proves, with evidence, that every change A to X (and T if it was unblocked) is implemented and archived, that the connector satisfies the commercetools Connect production-readiness checklist, that each owner requirement R1 to R10 is met, that the release is versioned and tagged, and it leaves the owner with handover notes, an open-items register and a post-v1 backlog. Without this change "done" would mean "every spec says it is done"; Z makes it mean "the product, as published, was tested end to end and the claims in its README are true".

- Change ID: **Z** (`z-release-verification`). Wave 11, size S.
- Needs: **X** (publication gate passed, public single commit exists) and, only if it was unblocked, **T**. Transitively everything else.
- Unblocks: nothing; it is the end of the A to Z chain. The reserved letter `Y` stays unused for a post-v1 follow-up.

## What Changes

- Create the **A to Z acceptance table**: one row per change with the evidence required (archive entry, test commands, Chrome scenario ids, artefacts) and the actual evidence recorded.
- Verify **administrator access** on the staging deployment: `ADMIN_USER_IDS` configured with user A's id only, the user-id bootstrap (read "Your user ID", `configure`, refresh) and a rehearsal with the admin user and the non-admin user, and no `assistant-admin`-style permission group in the permission list of the registered apps (it was REMOVED from the design).
- Apply the **Connect production-readiness checklist** from the `commercetools-connect` skill (every box, including the boxes that are not applicable and why) with the exact proof for each.
- Produce a **requirements trace** R1 to R10 (`plans/00-overview.md`) to evidence.
- Define and execute the **release procedure**: version `0.1.0`, tag `v0.1.0`, Connect staging from the public repository, sandbox deployment, final full regression run, anonymous-clone proof, rollback note.
- Write **handover notes** (what the owner must know to operate, upgrade, rotate secrets, extend), an **open-items register** (every unresolved item from every change, each with owner and decision), and the **post-v1 backlog** (optional retention job only if the owner reverses the keep-forever decision, identity jwt-bearer exchange, marketplace certification, performance and accessibility testing, shared-code extraction, and more).
- Add two small helper scripts under `scripts/release/`: `acceptance.mjs` (aggregates the table from the repository state) and `check-tasks-shape.mjs` (verifies that archived `tasks.md` files follow the junior-developer shape required by R10).

## Capabilities

### New Capabilities
- `release-verification`: acceptance table, production-readiness proof, requirement trace, release/version/tag procedure, handover, open-items register and backlog.

### Modified Capabilities
<!-- none -->

## Impact

- New internal artefacts under `plans/evidence/z/` (not published) and two public helper scripts. The published repository gains a `CHANGELOG.md` entry (owned by W) and a tag.
- Needs manual steps M1, M2, M12, M13, M15 (repository creation, org property, owner approval, tag push, staging repository) and Connect login (M4).
- No change to product behaviour. If a check fails, Z opens a fix in the owning change (via `/opsx:update`), it does not patch around it.

## Out of scope

- New features, refactors or documentation (those belong to the owning changes and W).
- Public marketplace certification (`connectorstaged certify`) unless the owner answers Q14 with "production"; the checklist is nevertheless applied because the certification review looks at the same things.
- Load, performance, accessibility and cross-browser testing (listed in the backlog).
- Operating the deployment after handover.

## Legacy source

None. Z reads only this repository and the Connect skill:
- `/Users/behnam/.claude/plugins/marketplaces/commercetools/skills/commercetools-connect/SKILL.md` (section "Production-readiness checklist (the gate)")
- `.../references/deployment-installation.md` (Checklist, Pattern 5 and 6), `.../references/merchant-center-customizations.md` (Checklist), `.../references/project-structure.md` (Checklist)
- `plans/00-overview.md`, `plans/03-spec-dependency-map.md`, `plans/owner-questions.md`, `plans/manual-steps.md`
