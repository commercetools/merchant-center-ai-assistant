# Consolidated TODOs

Every actionable item from the per-change notes (`<id>-notes.md` in this folder), `plans/owner-questions.md` and `plans/manual-steps.md`, de-duplicated. Each line cites the note it comes from. Change letters follow `plans/03-spec-dependency-map.md`. Change Z is written separately and is not covered.

Sections: (a) code and spec work agents can do next, (b) work that needs live credentials or environments, (c) publication tasks, (d) verification debt (open platform facts and live probes).

Items already closed by the integration cleanup (`cleanup-notes.md`) are not repeated: response envelope unification (N/G), I's temporary result pipeline replaced by L's, U's custom-object probe and `pre-undeploy` container names moved to E's gateway, `enableRetry:false`, shared aad helpers, `isUsableTranspiledCode` in `mc-app`.

## (a) Code and spec work for agents

| Id | Change | Area / file | Work | Source |
|---|---|---|---|---|
| TA-01 | A, B, U, V, X | `tasks.md` of those changes | Replace `node --test scripts/tests/` by the glob form `node --test scripts/tests/*.test.mjs` (a directory argument fails on Node 22). | a-notes, b-notes, u-notes, x-notes |
| TA-02 | A | `scripts/spdx-check.mjs`, `scripts/check-repo-rules.mjs` | Untested on Windows paths and outside a git repository; decide whether to test. `--year` must be passed for the publication year (2026 default). | a-notes TODOs |
| TA-03 | A | `scripts/lib/files.mjs` | Confirm `FRAMING_WORDS` equals the policy patterns (needs the real policy; see Q-impl-69). | a-notes Q2 |
| TA-04 | B | `.gitignore` | Add `.connect/*.log` (task 6.1 watch-out); `scripts/package.json` ownership already merged. | b-notes TODOs |
| TA-05 | C | `connect.yaml`, `scripts/check-connect-layout.mjs`, `service/src/config` | Decide and declare `LOG_HTTP`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS` (readable from env but not settable on Connect); keep checker tables in step. | c-notes gaps, w-notes gaps |
| TA-06 | C, I | `service/src/app.ts` | Adopt a shared `SERVICE_BASE_PATH` constant (today literal `/service` plus a copy in `identity-mcp/constants.ts`). | i-notes gaps |
| TA-07 | C | `service/package.json` | Dependency hygiene: ESLint 8 and typescript-eslint 5 (EOL), triage `npm audit`, two `google-auth-library` copies, msw 3 snippets; CQ1 `platform-sdk ^8`. | c-notes gaps, f-notes gaps, h-notes TODOs |
| TA-08 | C | `service/src` | Echo `X-Correlation-Id` in responses (accepted, not returned). | w-notes gaps |
| TA-09 | D | `service/src/auth/admin.ts`, debug log | Decide on the debug-level `userId` log (Q-impl-04). Optional: accept `;`/whitespace separators if the Connect check (VD-04) fails. | d-notes TODOs, u-notes U10 |
| TA-10 | E | `service/src/persistence/feedback`, `limits.ts` | Delete or align the unused helpers `FEEDBACK_CHUNK_BYTES`, `MAX_SNAPSHOT_BYTES`, `buildSnapshotChunks`, `reassembleSnapshot`. | n-notes gaps, cleanup-notes |
| TA-11 | E | `openspec/changes/e-persistence-custom-objects` | Fill design Appendix C after the live probes (see TB-03); add the Appendix A note to the tasks of G, I and N ("created Custom Objects ... list with `GET /custom-objects/ai-assistant-sessions`"). | e-notes TODOs |
| TA-12 | E | `service/src/persistence` | Optional: `updatedAt`/`lastModifiedAt` sort for the backoffice list; `P-var-types` once known to move numbers/booleans to input variables. | n-notes Q1, e-notes TODOs |
| TA-13 | F | `openspec/changes/f-gcp-credentials-and-vertex-llm/design.md` | Spec text should name `ai@7.0.136` (not 7.0.134) and the 16 KiB key limit; add Appendix A results table after TB-02. | f-notes gaps, TODOs |
| TA-14 | G | `service/tests/contract/routes.spec.ts`, G's rest-api-contract table | Add rows for `GET /service/health` and `GET /service/status/nimbus`; confirm no `pendingUntil` markers remain for rows 19, 20-25, 28; fix "rows 26, 27 and 29". | g-notes gaps, k-notes gaps |
| TA-15 | G | `service/src/services/session.service.ts` | Optional digest-before-close fallback with 3 s cap if VD-12 fails. | g-notes Q1 |
| TA-16 | H | `service/src/agents/prompts/*` | Prompt cleanup pass (sub-agent wording, "switch to the export agent"); give every source a good one-line `description` and routing hints; compare routing with legacy in E2E. | h-notes gaps |
| TA-17 | H | `service/src/chat/stream` route, `app.ts` | Decide a higher JSON body limit for `POST .../message/stream` (Q-impl-29). | h-notes Q3 |
| TA-18 | H | `service/src/tool-sources/types.ts` | Optional `ctx.hasTool` or pass merged tool names to `getPrompt` (for M's Nimbus-gated prompt). | m-notes gaps |
| TA-19 | H, L | `service/src/chat/history.ts`, `analytics`/`storage/file-parts.ts` | If image edit of earlier generated images is wanted: make `toModelMessages` convert files nested in `tool-imageGeneration` outputs. | h-notes deviations |
| TA-20 | H | `service/src/chat/stream.ts` | Persist continued assistant messages (auto-send after a tool result) if wanted. | h-notes gaps |
| TA-21 | I | `service/src/identity-mcp` | Implement the bind-time fallback decided at Q-impl-01; tighten `NO_PERMITTED` after TB-06; share `describeMcpFailure`; decide rebind cleanup. | i-notes Q1, Q2, TODOs |
| TA-22 | J | `service/src/tool-sources/stripe`, menu | Trim the Stripe menu to 21 real tools or keep 24 (Q-impl-39); decide Algolia allow-list (Q-impl-40). Note: `service/.npmrc` `legacy-peer-deps=true` must be documented. | j-notes Q2, Q3, TODOs |
| TA-23 | J | `service/tests` | `request()` helper of task 5.1 was intentionally not built; the V.1 test names differ from the list; update the task list. | j-notes TODOs |
| TA-24 | K | `service/tests/nimbus/nimbus-pin.spec.ts` | Point the test to `service/src/composed-pages/prompt/nimbus-surface.generated.ts` (M's final path) first; keep the mc-app fallback. | m-notes gaps, k-notes gaps |
| TA-25 | K, O | `mc-app/package.json`, `composed-apps/package.json`, `mc-view-app/package.json` | Pin `@commercetools/nimbus` exactly (Q-impl-21) and add a check that compares frontend manifests with `nimbus-mcp`. | k-notes Q2 |
| TA-26 | L | `service/scripts/check-gcp-cleanup.mjs`, `service/tests/analytics/tables.int.spec.ts`, storage integration test | Write the missing script (E2E-L-07) and the two integration tests; create `plans/evidence/L` notes after live runs. | l-notes TODOs |
| TA-27 | L, H | `tool-sources` | Consider wrapping third-party MCP and Nimbus results in the offload pipeline. | cleanup-notes |
| TA-28 | M | `service/src/composed-pages` | Optional worker thread for hard Babel timeout; measure memory next to the Nimbus child. | m-notes gaps |
| TA-29 | M, R, P | `composed-apps/src` | Replace `hasReturnStatement` path in `composed-apps` by the parser check; add a fixture-reading test in `composed-apps/src/hooks/use-composed-pages-storage/parse.spec.ts`; add `isUsableTranspiledCode` (service vs `mc-app` vs `composed-apps`) to `scripts/check-duplicates.mjs` or an equivalent check. | cleanup-notes, r-notes gaps, m-notes TODOs |
| TA-30 | P, M | `mc-app/src/types/composed-page.ts`, `hooks/use-current-user.ts` | Fix the header "Current version: 4.0"; fix the stale comment about `anonymous` and `?userEmail=`. | m-notes TODOs, p-notes gaps, q-notes TODOs |
| TA-31 | O | `mc-app`, `composed-apps`, `mc-view-app` | Delete the unused `@types-extensions/json-stable-stringify` shim (renamed and private); extend `scripts/check-versions.mjs` beyond `@commercetools-frontend/*` (jest, `@babel/core`, `@tabler/icons`); add a test for `scripts/check-frontend-leftovers.mjs`; reconcile jest versions. | o-notes gaps, TODOs |
| TA-32 | O, B | `scripts/check-connect-layout.mjs` | Revisit the MCP-scope rule per Q-impl-46 (composed-apps already exempt). Decide trimming of the ~50 commerce scopes (Q-O2). | o-notes Q2, Q3, r-notes |
| TA-33 | P, Q, S | unit tests | Add tests for `session.tsx` (stale-session recovery, delete-current), `useNextPrompts`, `ConnectProvider` gate order, `useIdentityStatus`, `DetailLevelControl` save-from-effect, `thread-list` filters, query tab, S session context and `useMcSession` error mapping; alasql insert test. | p-notes, q-notes, s-notes TODOs |
| TA-34 | P, Q | `mc-app/src/contexts/data-sources-context.tsx`, `humanize-tool.ts` | Remove leftover "data-warehouse" comment; confirm the `bigquery` label text. Keep `composed-renderer` drift group in step with mc-app edits. | q-notes TODOs, r-notes gaps |
| TA-35 | P | `mc-app` composer | Stop button (Q-impl-53); optional `data-testid` hooks (Q-impl-54). | v-notes Q2, Q3 |
| TA-36 | Q | `mc-app/src/components/new-chat/parts/server-tools` | Wire `useMcpProviders()` into the tool menu if Q-impl-45 says so. | q-notes Q1 |
| TA-37 | U | `service/tests/connector` | Write the two tests that were impossible before J and L landed: `providers: invalid stripe key reported as missing` and `post-deploy: analytics self-check creates dataset and bucket when permitted`; tick V.2. | u-notes gaps |
| TA-38 | U | `docs/deployment-runbook.md` | Update quoted lifecycle probe text (5xx reason now "commercetools unavailable"); record results after rehearsal in the "Verified behaviour" table. | cleanup-notes, u-notes |
| TA-39 | V | `e2e/`, `scripts/e2e` | Write seeds `large-snapshot` and `sessions-many`; add a scrub pass to `collect-evidence.sh`; record M8a and the amendment list (`plans/06-amendments-applied.md`); add the `redeploy` command (Q-impl-28) if wanted. | v-notes TODOs, Q5 |
| TA-40 | W | `docs/*`, `README.md`, `service/README.md` | Write: "Using the assistant" guide, "adding a store" guide, analyzer window (10 messages), composed page caps, export caps in `docs/api.md`, Stripe pin note, known-issues note (RQ11), Connect cold-start wording after measurement; optionally let `gen-config-table.mjs` generate the "read but not declared" table. | w-notes TODOs |
| TA-41 | W | `docs/architecture.md` | Add the dev-name to published-name table (Q-impl-60); link `e2e/README.md` from `CONTRIBUTING.md` and README now that V is in the tree. | w-notes Q3, gaps |
| TA-42 | all | spec text | Correct the defects listed in missed-features MF-103 in the owning changes (`/opsx:update`). | multiple |
| TA-43 | all | `openspec/changes/*/tasks.md` | Tick tasks whose work is finished; leave unticked only items in sections (b) to (d) (many notes list unticked 0.x doc-reading tasks that were skipped). | multiple |
| TA-44 | X | scrub input | Rewrite the 61 NEEDS-HUMAN lines and the 5 docs-hygiene findings at their source (see TC-01). | x-notes |

## (b) Needs live credentials or environments

Manual step ids refer to `plans/manual-steps.md`. Note that M23 does not exist and M25 was withdrawn (e-mail admin model).

### Manual steps and what they unblock

| Manual step | What the owner supplies | Unblocks |
|---|---|---|
| M3 (refined) | Scratch commercetools project, API client with `view_`/`manage_key_value_documents`, `service/.env.local` | E integration contract/probes (TB-03), all integration tests, V |
| M4, M16 | Connect login, Connect API client and secret in untracked `scripts/connect/.env.connect` | U rehearsal, V, finalize |
| M5 | GCP service account (Vertex, BigQuery, Storage), Base64 key in `service/.env.local` | F smoke (tasks 1.3, 6.2, V.2), L spikes, V |
| M6, M7 | Register `AI Assistant`, `AI Assistant Pages` custom apps and the `AI Assistant` custom view with a placeholder URL; ids to `.env.connect`; confirm the 65 locators are accepted (RM8) | B/O/S/U, V |
| M8 | Dedicated Chrome with remote debugging, one login to Merchant Center, DevTools MCP args, restart of Claude Code (MCP also failed to connect in earlier sessions) | all E2E |
| M9 | Paste the three URLs printed by `finalize` into the registrations | U, V |
| M10 | Users A (id in `ADMIN_USER_IDS`) and B (not), second Chrome profile and port for B | V, D, G, I, N, Q |
| M11 | Create the identity-mode Managed MCP server, one consent click | I, V (also verdict, TB-06) |
| M14 | Docker Desktop running | every `commercetools connect validate` (B, C, D, F, H, K, L, M, O, P, Q, R, S, U, W) and X anon proof |
| M15 | Private staging repo and `connect-mu` read grant | U, V |
| M18 | `cloudflared` | V local runs (`dev-up.sh`) |
| M19 (optional) | Second scratch project | project-key mismatch test (V, D) |
| M20 | Product `e2e-product`; its Merchant Center URL as `HOST_PAGE_URL` | S, V |
| M21 (optional) | Contentstack key and token, Algolia MCP URL, Stripe test restricted key, set through Connect configuration | J live, V |
| M22 | Allow sandbox measurements: ~4 minute turn, 10 MB feedback upload, Nimbus cold start/memory | H, N, K |
| M24 | Delete the `e2e-ai-assistant` MCP server if the app cannot | Q |

### Live work items

| Id | Work | Needs | Source |
|---|---|---|---|
| TB-01 | `commercetools connect validate` for every change that lists it unticked: B (6.1, V.1, V.4), C (1.1, 6.2, V.3), D (V.2), F (V.3), H, K, L, M, O (13.3), P (21.3), U, W, X (anon proof). | M14 | b-notes, c-notes, d-notes, f-notes, h-notes, o-notes, p-notes, u-notes, x-notes |
| TB-02 | F live smoke: model availability in `us-central1` (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image`), thought-signature replay, image output, tool-continuity assertions; results into design Appendix A; tasks 1.3, 6.2, V.2. | M3, M5 | f-notes TODOs |
| TB-03 | E integration contract and probes (`P-charset`, `P-created`, `P-409`, `P-create-version-zero`, `P-claim`, `P-list-after-write`, `P-var`, `P-keyin`, `P-sort`, `P-order`, `P-null`, `P-size`, `P-offset`/`P-limit`, `P-total`); `PERF=1 npm run test:integration -- perf.sessions` (tasks 7.2-7.5, V.2). | M3 | e-notes TODOs |
| TB-04 | G: predicate `value(featureFlags(customView = "..."))` against a scratch project (OQ-G5); N: probe `createdAt` predicates/sort (task 3.2), live 6 MiB snapshot via curl with sha256 compare. | M3 | g-notes TODOs, n-notes TODOs |
| TB-05 | H: live smoke of one message through `curl -N` and read back with `GET /service/session/<id>/messages`; real model paths for `getModel('lite'/'main'/'image')`. | M3, M5 | h-notes TODOs |
| TB-06 | I: `npm run probe:identity` against a real identity-mode server (OQ-I1 scope `mcp:`, OQ-I2 refresh rotation, wording of the "no tool permitted" rejection, verdict); `tests/integration/identity-adapters.spec.ts`. | M11 | i-notes TODOs |
| TB-07 | J live checks: real Knowledge MCP handshake, Algolia, Contentstack (EU region key), Stripe test key, Gemini accepting dotted tool names. | M21 | j-notes TODOs |
| TB-08 | K sandbox smoke and footprint (task 8.2): `SERVICE_URL=<deployed> npm run smoke:nimbus`, deployment logs for `nimbus-mcp stderr`/OOM, write `plans/evidence/K/footprint.md`. | U deployed | k-notes TODOs |
| TB-09 | L spikes: dry-run `referencedTables` (3.1, OQ-L1), binary through the gateway (6.4, OQ-L7), `sharp` on Connect buildpack (8.3). | M3, M5, deploy | l-notes TODOs |
| TB-10 | U rehearsal (task 9.1): fill the "Verified behaviour" table U1-U10; save masked evidence under `plans/evidence/u/`; verify repeated `--configuration`, `--startDate` time zone, "not found" text of `connectorstaged describe`, `Deployment` JSON fields. | M3-M7, M10, M14-M16 | u-notes TODOs |
| TB-11 | R: seed `e2e/fixtures/seed-composed-pages.mjs` and run locally (9.1); verify `fetchMore` merging for totals above 100 and that `sort: ["createdAt asc"]` is accepted by the proxy. | M8, scratch project | r-notes TODOs |
| TB-12 | O: `yarn start` of each app, CSP completeness, `NimbusProvider` inside `ApplicationShell`, `chatServiceEndpointUrl` reaching `window.app.additionalEnv`, dev placeholder behaviour (10.x, 11.x, 13.4). | M6-M8 | o-notes TODOs |
| TB-13 | P: Popover user menu, Agentation toolbar, Babel renderer, streaming retry banner, `blob:`/`data:` image CSP (E2E-P-15). | M8, deploy | p-notes TODOs |
| TB-14 | Q: Settings drawer layout, About section, backoffice `Link href`, popup OAuth origin check, DataTable `UserDisplay`, alasql with real data. | M8, M10 | q-notes TODOs |
| TB-15 | S: panel layout in `SMALL` width, `ChatMessageList` height in iframe, `useChat` resume, StrictMode, `yarn start` host page, CSP; confirm DevTools reaches the iframe. | M7, M8, M20 | s-notes TODOs, v-notes gaps |
| TB-16 | V first real run: confirm selectors, `mc-scripts start` port option for `dev-up.sh`, `E2E-D-06` wording, `E2E-C-02` connect.yaml grep, route shape `/e2e-param/<orderId>`, R texts, `emulate networkConditions` value, identity callback URL read from `list_pages`. | M8, M10 | v-notes TODOs |
| TB-17 | Sandbox measurements: ~4 minute turn and idle SSE cut (OQ-H2), 10 MB feedback upload (OQ-N2), request-body ceiling (CQ8), cold start of the service. | M22 | h-notes, n-notes, owner-questions |
| TB-18 | Re-read all docs after the rehearsal and correct what differs (W). | after TB-10 | w-notes TODOs |

### E2E scenarios not yet run (147 cards, all `Status: NOT RUN`)

Counts per change are the number of cards in `e2e/` (v-notes Summary); the owning change's notes list the ids they ran into, which are the same cards, except where noted.

| Change | Cards | Ids named in the owning notes |
|---|---|---|
| C | 2 | not named (v-notes) |
| D | 6 | E2E-D-01..03 named in d-notes; D-04..06 are shell cards from V |
| E | 3 | not named in e-notes |
| F | 3 | not named in f-notes |
| G | 8 | E2E-G-01..08 |
| H | 8 | E2E-H-01..08 |
| I | 8 | E2E-I-01..07 plus I-05b |
| J | 6 | E2E-J-01..06 |
| K | 5 | E2E-K-01..04 named in k-notes; K-05 (child respawn) added by V |
| L | 8 | E2E-L-01..08 |
| M | 6 | E2E-M-01..06 |
| N | 6 | E2E-N-01..06 |
| O | 6 | E2E-O-01..06 plus repeats for composed-apps and mc-view-app in 11.6 |
| P | 16 | E2E-P-01..16 |
| Q | 16 | E2E-Q-01..16 |
| R | 9 | E2E-R-01..09 |
| S | 12 | E2E-S-01..12 |
| U | 6 | E2E-U-01..03 named in u-notes; U-04..06 (two-phase, idempotent redeploy, undeploy) from V |
| V | 13 | cross-cutting cards (V-01..V-13) |
| Total | 147 | sum equals the lint output "147 cards in 19 playbooks" |

Regression order: 9 tiers in `e2e/02-regression-order.md`; start with tier 1 (C, D shell cards), then G/H, then frontends.

## (c) Publication tasks (change X, and M12/M1/M2/M13/M17)

| Id | Task | Source |
|---|---|---|
| TC-01 | Fix the 61 NEEDS-HUMAN lines at their source: 4 lines quoting a home-directory prefix (`openspec/changes/a-repo-bootstrap-labs-compliance/specs/repo-compliance/spec.md:81`, `.../a-repo-bootstrap-labs-compliance/tasks.md:149`, `openspec/changes/w-docs-and-readmes/design.md:102`, `.../w-docs-and-readmes/tasks.md:39`) and 57 lines citing change-local question ids (`CQ1 CQ5 CQ6 CQ7 GQ1-3 HQ1-3 IQ1 IQ2 IQ3 IQ11 NQ1 OQ-M1 OQ-M3 OQ-M4 RQ4-RQ13`) in `design.md`/`tasks.md` of changes c, e, f, g, h, i, j, k, l, m, n, q, r, s, v, w, x, z (23 files, see the scrub report). Target: `scrub` exits 0. Alternative: publish a "local ids" table (Q-impl-61). | x-notes |
| TC-02 | Fix the 5 docs-hygiene findings (`check-repo-rules.mjs --docs --strict`): the 4 home-directory lines above plus `openspec/changes/v-e2e-chrome-testing/tasks.md:69` (a tunnel-service host pattern quoted in a command; reword to the class). | x-notes |
| TC-03 | Archive changes A..W (`openspec archive <id> --yes`); only A is complete, V and W have open boxes, others open doc/verification boxes. Keep X and Z unarchived until the end. `openspec/specs/` is empty in the copy until then. | x-notes Q7, TODOs |
| TC-04 | Rerun `node scripts/internal/prepare-publish.mjs --out "$HOME/labs-publish/ai-assistant" --year 2026 --stage all` after TC-01 to TC-03 and read the 30 framing-word lines of the scrub report. | x-notes TODOs |
| TC-05 | Gate `--ack` decision: 17 warnings, all the one ambiguous word for the dropped widget endpoint (13 lines in `openspec/changes/{a,c,e,g,h,v,w,x}-*/`, plus `e2e/V-cross-cutting.md`, `plans/00-overview.md`, `plans/01-source-inventory.md`, `service/tests/contract/routes.spec.ts`). Proposed ack reason: "named only to record that the legacy widget endpoint was removed; no customer data". Maintainer decides at M12 (ack or rename in the scrub). Also decide the 392 leak REVIEW hits (multitenant 161, Firestore 105, tenant 81, cloud-run 28, widget-bootstrap 17), historical text. | x-notes |
| TC-06 | Fill `scripts/internal/leak-patterns.json` `blockPrivate` from the private token list (store identifier, research-firm name, GCP project ids, UUIDs); never copy it into docs (XQ3, M17). | x-notes TODOs |
| TC-07 | Anonymous-clone proof: rerun `scripts/internal/anon-proof.sh` once WITHOUT the frontends skip so one log ends in an unqualified `ALL STEPS PASSED`; start Docker for `connect validate` (M14). After publication run it against the public URL. | x-notes |
| TC-08 | Unticked X tasks that need the final archived tree: 1.1, 3.3, 4.3, 5.1, 6.1, 6.2, 7.2, 8 (8.1 `approval.md` needs the final sha), V.*. | x-notes TODOs |
| TC-09 | [MANUAL M12] maintainer approval: LICENSE holder text, README banner wording, scrub report and leak-scan result for published `plans/` and `openspec/`, removal of `.claude/`, `CLAUDE.md`, internal scripts, screenshot review (RM7). Never ticked by an agent. | x-notes, manual-steps |
| TC-10 | [MANUAL M2] org custom property `commercetools-labs`; [MANUAL M1] create the PUBLIC repo `commercetools/ai-assistant` (not private first) and push; run the gate immediately before the push. | manual-steps, x-notes |
| TC-11 | [MANUAL M13] tag `v0.1.0` on the public repo, then `connectorstaged create`; rehearsal tags `-rc1/-rc2` on the staging repo. | manual-steps |
| TC-12 | [MANUAL M17, optional] ask the labs tooling maintainers to extend `policy.json` with repo-specific tokens. | manual-steps, x-notes |
| TC-13 | Decide publication of `e2e/`, `scripts/e2e/` and keep `plans/implementation/` unpublished (Q-impl-62, Q-impl-63); approve commit author and message (Q-impl-65). | x-notes |
| TC-14 | SUPPORT.md: real channel for discussions and private vulnerability reporting (Q-impl-58); real LICENSE year via `--year`. | w-notes, a-notes |
| TC-15 | Rollback plan (task 9.5): delete repo, rotate credentials, rebuild; steps are in `tasks.md` only. | x-notes |

## (d) Verification debt

Open platform facts and live probes. "Blocking" means other work depends on the answer.

| Id | Item | How to settle | Blocking | Source |
|---|---|---|---|---|
| VD-01 | `/proxy/forward-to` passes binary bodies up to 10 MB (OQ-L7); private image mode depends on it. | L spike 6.4 | yes | l-notes Q2 |
| VD-02 | Identity auth2 bind verdict: does a real identity-mode server satisfy `auth2` (OQ-I1 scope `mcp:`, OQ-I2 refresh rotation grace, IQ2/IQ3 https callback in local dev)? | TB-06 with M11 | yes | i-notes Q1, owner-questions IQ2/IQ3 |
| VD-03 | Connect injects `PORT` (U3 / Q-C1). | first sandbox deploy (U) | yes | c-notes TODOs, u-notes U3 |
| VD-04 | Comma-separated `ADMIN_USER_IDS=a,b` given to `--configuration` arrives as ONE key (U10, owner-questions OQ7/Q6). | rehearsal | yes | u-notes U10, owner-questions |
| VD-05 | Connect builds MC apps with yarn or npm (OQ7, Q-O3); `postinstall` uses `npm run` so both should work. | rehearsal | yes | o-notes Q1, owner-questions |
| VD-06 | Does `npm ci` in `postDeploy` drop devDependencies? `typescript` is a devDependency and `postDeploy` runs `npm run build` (U6); may need `npm ci --include=dev` in `connect.yaml`. | rehearsal | yes | u-notes U6 |
| VD-07 | Does a configuration redeploy rebuild the frontends so `chatServiceEndpointUrl` appears in the served `index.html` (U2)? If not, STOP and ask; two-phase architecture depends on it. | rehearsal | yes | u-notes U2 |
| VD-08 | Remaining U items: U1 non-required key without default (absent or empty), U4 changed `inheritAs` scopes applied by `redeploy --updateConnector`, U5 `MC_AUDIENCE` and the full configuration visible to lifecycle scripts, U7 deploy/redeploy duration (25 min finalize timeout), U8 private ConnectorStaged and `privateProjects`, U9 empty value clears a key. | rehearsal | partly | u-notes TODOs |
| VD-09 | Connect size limit for a ~3.2 KB secured configuration value (Q-F4). | first sandbox deploy | no | f-notes TODOs |
| VD-10 | Models exist on Vertex in `us-central1`; image model availability (Q-F2/D9); thought-signature replay; image output (`result.files`). | TB-02 | yes | f-notes, b-notes |
| VD-11 | Nimbus child spawn under Connect: `process.execPath` is `node` in the buildpack image (OQ-K5), RSS under 512 MB with service, scale-to-zero cold start, orphan cleanup. | TB-08 | yes | k-notes TODOs |
| VD-12 | Digest and follow-up work after the response closes on the real runtime (R-G1, E2E-G-03). | sandbox | no | g-notes, w-notes |
| VD-13 | SSE idle cut below 5 minutes (OQ-H2, E2E-H-04); keep-alive 20 s in `chat/stream.ts`. | M22 | no | h-notes Q4 |
| VD-14 | Request-body ceiling on Connect (CQ8) and 10 MB feedback upload (OQ-N2). | M22 | no | owner-questions, n-notes |
| VD-15 | BigQuery dry run returns `referencedTables` (OQ-L1); billing enabled (IQ10). | TB-09 | no | l-notes |
| VD-16 | `sharp` builds on the Connect buildpack (8.3). | TB-09 | no | l-notes |
| VD-17 | `legacy-peer-deps` in `service/.npmrc` is honoured by Connect's build; Stripe toolkit install works there. | rehearsal | yes | j-notes |
| VD-18 | `commercetools connect validate` outcome for the whole repo (Docker never available): accepts `required: false` with a `default` on a key, the 65 locators (RM8), `.connect/project.toml` need (design E7). | TB-01 | yes | b-notes TODOs |
| VD-19 | Real MC gateway: first-request JWKS latency, clock skew (R3/R4), claim name `${iss}/claims/project_key`, project guard behaviour, audience policy (origin only). | E2E-D-01..03, rehearsal | no | d-notes TODOs |
| VD-20 | Custom Objects behaviours not yet probed: `version: 0` create, `P-var-types`, empty-string payload, `createdAt` sort/predicates, `P-offset`; `lastModifiedAt` bump on replace (`touch`). | TB-03, TB-04 | no | e-notes, n-notes |
| VD-21 | Third parties: Knowledge MCP, Algolia, Contentstack EU, Stripe test key; Gemini with dotted tool names. | TB-07 | no | j-notes |
| VD-22 | Merchant Center behaviours: CSP (`blob:`, `data:`), 65 locators accepted at registration, entry-point permission names (`entryPointUriPathToPermissionKeys`), `mc-scripts start` port option. | M6-M8 | no | o-notes, s-notes, w-notes, v-notes |
| VD-23 | Connect CLI details: repeated `--configuration` flags, `--startDate` format/time zone, text of "not found" in `connectorstaged describe`, Deployment JSON fields (`version`, `lastModifiedAt`, `MC_AUDIENCE`), log ingestion lag versus `Deployed`. | TB-10 | no | u-notes TODOs |
| VD-24 | E2E tooling assumptions: DevTools reach into the cross-origin view iframe, gateway replay via page `fetch` wrapper, identity callback URL readable from `list_pages`, `--redactNetworkHeaders` effect. | TB-16 | no | v-notes gaps |
| VD-25 | Behaviour of the composed-page validator and renderer in a browser (hooks components, Babel renderer, CSP `unsafe-eval` only where intended). | E2E-M, E2E-P, E2E-R | no | m-notes, p-notes, r-notes |
| VD-26 | Unit-tested only with fakes, never against the real thing: `connect.mjs` (fake CLI), `post-deploy`/`pre-undeploy`, `seed.mjs`, `cleanup.mjs`, `two-instance.mjs`, `make-bad-jwt.mjs`. | TB-10, TB-16 | no | u-notes, v-notes |
