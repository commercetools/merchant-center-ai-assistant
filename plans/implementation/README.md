# Implementation notes: index

Every implementation change left a notes file here (`<id>-notes.md`) with Summary, Questions, Missed features / gaps, TODOs and Deviations. Three consolidated, de-duplicated files sit on top of them:

- [questions.md](questions.md): 69 open questions for the owner, grouped by theme, with default and priority.
- [missed-features.md](missed-features.md): features and behaviours not implemented or only partly implemented, with severity and suggested owner.
- [todos.md](todos.md): actionable work in four parts (agent work, live-credential work mapped to manual steps and E2E cards, publication, verification debt).

Sources besides the notes: `plans/owner-questions.md`, `plans/manual-steps.md`, `plans/03-spec-dependency-map.md`. Change Z (release verification) is written separately and is not indexed here. This folder is internal and is listed in `scripts/internal-paths.json`, so it is not published.

## Dependency order and status

Order follows `plans/03-spec-dependency-map.md` (A to Z; T and Y are unused). Status values:

- implemented + unit-tested: code or tooling is done and its automated checks pass offline.
- needs live verification: additionally depends on Docker, Connect, Merchant Center, Google credentials, a scratch project or Chrome, none of which were available to the agents. No Chrome E2E card (147) and no `commercetools connect validate` has ever been run.

| Change | One line | Status | Notes |
|---|---|---|---|
| A | Repo bootstrap, labs compliance tooling (LICENSE, SPDX, repo rules, gate wrapper) | implemented + unit-tested (16 tests); real policy patterns unconfirmed | [a-notes](a-notes.md) |
| B | Connect skeleton: `connect.yaml`, four app stubs, layout checker | implemented + unit-tested; needs live verification (`connect validate`, Docker) | [b-notes](b-notes.md) |
| C | Service foundation: config, logger, errors, cache, status | implemented + unit-tested; needs live verification (`PORT` injection, `validate`) | [c-notes](c-notes.md) |
| D | Merchant Center session auth, `ADMIN_USER_IDS`, project guard | implemented + unit-tested (real RS256 JWTs); needs live verification (E2E-D, gateway) | [d-notes](d-notes.md) |
| E | Custom Objects persistence, encryption, maintenance scripts | implemented + unit-tested (memory gateway); needs live verification (probes, benchmark) | [e-notes](e-notes.md) |
| F | Vertex Gemini providers, one service-account key | implemented + unit-tested; needs live verification (model ids, key, smoke) | [f-notes](f-notes.md) |
| G | Sessions, messages, digest, suggestions, settings endpoints | implemented + unit-tested; needs live verification (digest after response close) | [g-notes](g-notes.md) |
| H | Agents, tool-source registry, SSE chat stream, budget | implemented + unit-tested; needs live verification (real model turn, SSE limits) | [h-notes](h-notes.md) |
| I | Identity-mode managed MCP (OAuth, tokens, binding) | implemented + unit-tested; needs live verification (bind verdict `auth2` may be impossible) | [i-notes](i-notes.md) |
| J | Third-party sources: Knowledge, Contentstack, Algolia, Stripe | implemented + unit-tested; needs live verification (all four providers) | [j-notes](j-notes.md) |
| K | Embedded Nimbus MCP child | implemented + unit-tested; needs live verification (Connect footprint) | [k-notes](k-notes.md) |
| L | BigQuery offload, query tools, GCS images, export hardening | implemented + unit-tested (fakes); needs live verification (dry-run, binary passthrough, sharp) | [l-notes](l-notes.md) |
| M | Composed pages tool, v5.0 contract, validator | implemented + unit-tested; needs live verification (E2E-M); frontend adoption partial | [m-notes](m-notes.md) |
| N | Feedback and backoffice API, chunked snapshots | implemented + unit-tested; needs live verification (6 MiB snapshot, 10 MB upload) | [n-notes](n-notes.md) |
| O | Frontend foundation for the three MC apps | implemented + unit-tested; needs live verification (browser, CSP, Connect build) | [o-notes](o-notes.md) |
| P | mc-app chat surface | implemented + unit-tested (19 tests); needs live verification (16 E2E cards) | [p-notes](p-notes.md) |
| Q | mc-app admin surfaces: identity connect, settings, backoffice | implemented + unit-tested (42 tests in mc-app); needs live verification (16 E2E cards) | [q-notes](q-notes.md) |
| R | composed-apps (Pages) read-only app | implemented + unit-tested (25 tests); needs live verification (local run, 9 cards) | [r-notes](r-notes.md) |
| S | mc-view-app custom view panel | implemented + unit-tested (24 tests); needs live verification (iframe, 12 cards) | [s-notes](s-notes.md) |
| U | Connect deployment scripts without CI, lifecycle scripts, runbook | implemented + unit-tested (fake CLI); needs live verification (rehearsal, U1-U10) | [u-notes](u-notes.md) |
| V | Chrome E2E playbooks (147 cards) and helper scripts | cards and helpers written and lint/unit-tested; every card NOT RUN | [v-notes](v-notes.md) |
| W | README, docs, config table generators, docs checks | implemented + unit-tested (31 tests); needs live verification (re-read after rehearsal) | [w-notes](w-notes.md) |
| X | Publication toolkit: scrub, leak scan, prepare-publish, anon proof | implemented + unit-tested (24 tests) and dry-run on a copy; publication blocked on NEEDS-HUMAN lines, archive, M12 | [x-notes](x-notes.md) |
| Z | Release verification | written separately | not indexed |
| cleanup | Integration fixes after the merges (envelope, seams, retry, aad, parser) | done; unit-tested (170 service suites) | [cleanup-notes](cleanup-notes.md) |

## Top blocking items (details in the three files)

1. Models and Google key never exercised (Q-impl-13, TB-02, VD-10; M5).
2. Identity bind verdict may make `PUT managed-mcp-identity` impossible (Q-impl-01, VD-02; M11).
3. Binary passthrough through forward-to for private images (VD-01).
4. Connect `PORT`, comma-separated `ADMIN_USER_IDS`, yarn versus npm, devDependencies in `postDeploy`, rebuild on configuration redeploy (VD-03 to VD-07).
5. `commercetools connect validate` never run (Docker, M14; TB-01, VD-18).
6. Nimbus child within 512 MB on Connect (VD-11, Q-impl-20).
7. 147 E2E cards not run (todos.md section b; M3 to M10).
8. Rehearsal inputs missing: staging repo and region (Q-impl-19; M15).
9. Publication: 61 NEEDS-HUMAN lines, archive, gate acknowledgement, private token list, M12 (TC-01 to TC-09; Q-impl-58, 61, 64, 66, 67).
10. Body ceilings and SSE limits on Connect (Q-impl-33, VD-13, VD-14).
