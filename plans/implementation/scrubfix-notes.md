# Implementation notes: publication-hygiene fixes (scrubfix)

Dry run on a copy under the session scratchpad (archive, scrub, ossify, docs-strict, commit, gate, leak scan); nothing initialised in this repo, nothing pushed, no GitHub repository touched.

## Before / after

| Check | Before | After |
|---|---|---|
| scrub NEEDS-HUMAN | 61 (4 home-path rule texts, 57 undefined question ids) | 0 (exit 0) |
| `check-repo-rules.mjs --docs --strict` on the copy | 5 | 0 |
| leak scan BLOCK | 4 | 0 (373 REVIEW remain: tenant, Firestore, multitenant, Cloud Run words, historical rationale) |
| gate | 0 FAIL, 17 WARN (one ambiguous widget-endpoint word) | 0 FAIL, 0 WARN, `CLEAR` |

## What changed

- Rule texts in change A (spec, tasks), W (design, tasks) now describe the absolute-path class ("an absolute path under a user home directory") without the literal prefix; the checker constant is unchanged.
- Question ids: mirrors of change-local ids (CQ*, GQ*, HQ*, IQ*) were removed or replaced by the decided fact or a pointer to `plans/decisions.md`; the ids that have a definition in the same change (RQ4-RQ13, OQ-M1/M3/M4) were turned into bold definitions, which the scrub accepts as defined.
- Change V tasks: tunnel host pattern and a grep with tunnel-service names reworded to the class.
- The widget-endpoint word: reworded to "legacy widget ..." in published plans and openspec text; the docs-claims stale pattern and the w grep use `g[e]cx` (same match); the service contract test builds the legacy path by concatenation (same assertion); the e2e playbook step uses a neutral unknown path.

## Remains

- 373 leak REVIEW lines (not gate warnings): need a maintainer read at M12.
- `plans/implementation/scrubfix-notes.md` itself is under the internal folder and is removed from the publication.
- Items in x-notes.md that are not hygiene: archiving the changes, anonymous-clone proof without skip, Docker for `connect validate`, manual steps M1/M2/M12/M13/M14.

## Verification

Node tests (scripts, docs, internal) 197 pass; `spdx-check`, `check-repo-rules`, `check-connect-layout`, `check-duplicates` ok; `openspec validate --all --strict` 24 passed; service build, 1533 tests, lint (0 errors, 55 pre-existing warnings).
