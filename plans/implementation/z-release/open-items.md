# Open-items register

Built from the "Open questions" of every design, the questions and TODO lists of every implementation notes file (`plans/implementation/<letter>-notes.md`), the manual steps, and the results of this run. Classification follows design D5: an item **blocks release** if it makes a readiness row FAIL or NOT VERIFIED without an accepted default, leaves a requirement R1-R10 without evidence, is a security question, or is a known data-loss bug. Everything else has a target (v0.1.x, backlog, won't fix). Status values: open, resolved (decided in the plans), default-accepted-pending (a default exists, the owner has not confirmed).

"Owner" is the person who decides; "agent" means a verification that needs only the named manual step, not a decision. Items marked resolved are listed so that every design question appears once.

## 1. Release blockers found by this change

| Id | Source | Description | Impact | Decision / action needed | Owner | Status | Target |
|---|---|---|---|---|---|---|---|
| Z-01 | Z, R10 | `check-tasks-shape.mjs` reports 172 errors and 378 warnings over 24 `tasks.md` files (774 tasks): many tasks lack Why/Where/How/Done when/Watch out. The spec expects zero. | R10 not met by the strict rule | Either fix the listed tasks via `/opsx:update`, or the owner accepts the compressed form as the project's shape and relaxes the script. Do not edit the script to hide findings. | owner | open | blocks release (or explicit acceptance) |
| Z-02 | Z, R9 | No Chrome E2E run was ever executed: no `report.md`, all 147 cards NOT RUN. | R9 and the "feature works" half of R1 unproven | Execute tiers 0-8 of `e2e/02-regression-order.md` on a sandbox deployment (M4, M6, M7, M8, M10, M15, M16). | agent after owner steps | open | blocks release |
| Z-03 | Z, R2 | `commercetools connect validate` never ran (Docker daemon not running, M14). | Readiness row "validate before staging" NOT VERIFIED | Start Docker, run it, fix findings. | owner (M14) then agent | open | blocks release |
| Z-04 | Z | No change is archived (`openspec/changes/archive/` is empty; 24 active changes; many boxes unticked, see `acceptance.md`). | `acceptance.mjs --check` fails for every row | Finish the open boxes, `/opsx:verify`, `openspec archive <id> --yes` in dependency order. | owner / maintainer | open | blocks release |
| Z-05 | X | Gate is not yet CLEAR for a real publication. On the dry-run publication copy (`plans/implementation/scrubfix-notes.md`) the scrub reports 0 NEEDS-HUMAN lines, the docs-strict check 0 findings, the leak scan 0 BLOCK (373 REVIEW lines remain for a maintainer read) and the gate `CLEAR` with 0 WARN. Still open: the private-token list is empty, the REVIEW read, the archive step and the M12 approval. Nothing was published and the dry run is not a live verification. | R5 not met until the real run and approval | Rerun `prepare-publish.mjs --stage all` on the real publication tree, read the REVIEW lines, fill the private-token list, approve (M12). | owner | open | blocks release |
| Z-06 | X | No unqualified anonymous-clone proof: frontends were skipped in run 2 and `connect validate` skipped. | Spec "Anonymous clone" unmet | Run `scripts/internal/anon-proof.sh` once, complete, on the public tag. | agent after M1/M13 | open | blocks release |
| Z-07 | Z, 5.2-6.3 | Release rehearsal (`v0.1.0-rc1`), rollback rehearsal and final tag are unperformed: they need M1, M2, M4, M12, M13, M15, M16. | Spec "Rollback readiness", "Version and tag" unproven | Owner supplies the manual steps; follow `release-log.md`. | owner | open | blocks release |
| Z-08 | Z, W | `check-docs-claims --scrub` reported 3 internal-path mentions in `e2e/README.md`. | none now | Rewritten at the source (r2-docs): the file names the evidence root generically; `--certify --citations --scrub --stale` exits 0 in the development tree. Rerun once on the publication copy. | agent | resolved (dev tree) | v0.1.x (rerun at publication) |
| Z-09 | Z | Internal evidence archive (task 8.3) not created: the evidence of this run is a per-worktree, git-ignored folder. | Evidence loss risk (design R3) | Owner names the private archive location (RQ13) and archives `plans/evidence` after the real run. | owner | open | v0.1.x |

## 2. Platform facts only a deployment can settle (sandbox findings)

All items are **NOT VERIFIED**; none could be run here (no Connect login scope used, no Docker, no deployment). They are the first things to run on the sandbox (task 3.2).

| Id | Source | Description | Impact | Decision / action | Owner | Status | Target |
|---|---|---|---|---|---|---|---|
| Q-C1 | C | Does Connect inject `PORT`? Default 8080. | Service may not listen where expected | Check `deployment logs` after first deploy (U3). | agent | open | blocks release |
| Q-C2 / OQ-N2 | C, N | Is a 25 MB body accepted end to end (gateway, Connect ingress)? Feedback cap 10 MiB. | Large feedback snapshots could be rejected | Measure E2E-N-02 (M22). | agent | open | v0.1.x (adjust caps) |
| Q-C3 / CQ1 | C | Bump `platform-sdk`/`ts-client` majors? Default no. | none now | Owner confirms default. | owner | default-accepted-pending | backlog |
| Q-D2 | D | Real entry-point path of the registered app (default `ai-assistant`). | Wrong value breaks the app URL checks | Owner picks values at M6/M7. | owner | open | blocks release |
| U10 | U, D | Does `ADMIN_USER_IDS=idA,idB` stay one string through the CLI? Fallback separators not implemented. | Admin model (security) | Test with two ids on the sandbox. | agent | open | blocks release (security) |
| U1-U9 | U | Ten platform facts (non-required key default, configuration redeploy rebuilds frontends, PORT, scopes on `--updateConnector`, lifecycle env visibility, devDependencies in `postDeploy`, timings, private connector projects, empty-value `configure`). All rows of the runbook "Verified behaviour" table are `open`. | Deployment design (two-phase) may need change | Run the rehearsal (task 9.1 of U). | agent after owner steps | open | blocks release (U2 especially) |
| Q-F4 | F | Connect size limit for the 3.2 KB secured value. | Deploy fails | First deploy. | agent | open | blocks release |
| Q-F2 | F | Are `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image` available in the chosen location? Names copied unverified. | Chat fails at first request | Live smoke (M5). | agent | open | blocks release |
| OQ-H2 | H | Does the gateway or Connect cut an idle SSE stream below 5 minutes? Keep-alive 20 s. | Long turns fail | E2E-H-04 (M22). | agent | open | blocks release |
| R-G1 | G | Does Connect let digest and suggestions finish after the response closes? | Digests silently never arrive | E2E-G-03; fallback "digest before close, 3 s cap" needs an owner decision. | owner/agent | open | v0.1.x |
| OQ-I1 | I | Does auth2 grant the `mcp:` scope to the DCR client? | Identity MCP cannot connect | E2E-I-03 (M11). | agent | open | blocks release (security/auth) |
| OQ-I2 | I | Refresh-token rotation and reuse grace. | Users disconnected mid-session | E2E-I-06 (M11). | agent | open | v0.1.x |
| I-Q1 | I | Bind-time verdict `auth2` may be impossible (mode-blind metadata). | `PUT` can never succeed | Real identity-mode server (M11). | agent | open | blocks release |
| OQ-K1 / Q3 | K | Embedded Nimbus child viable in the Connect image under 512 MB? | Feature R1; fallback gateway not built | `SERVICE_URL=... npm run smoke:nimbus`; else `NIMBUS_MCP_ENABLED=false` and build K section 9. | agent then owner | open | blocks release |
| OQ-K5 | K | Spawn command `process.execPath` in the Connect image. | Same | Same smoke. | agent | open | blocks release |
| OQ-L1 | L | Does a BigQuery dry run return `referencedTables`? Fallback extractor exists. | SQL guard accuracy | Spike 3.1 (M5). | agent | open | v0.1.x |
| OQ-L7 | L | Does `/proxy/forward-to` pass binary bodies up to 10 MB? | Image display | Spike 6.4. | agent | open | v0.1.x |
| L-sharp | L | `sharp` on the Connect buildpack (optional import, falls back). | none (degrades) | Check on first deploy. | agent | open | v0.1.x |
| Q-O3 | O | Does Connect build the MC apps with yarn or npm? | Build may fail | First deploy. | agent | open | blocks release |
| G-E1 | E | Create races: the first write of a never-written object is an upsert; two simultaneous first writers can lose an update (settings, session create). Probe `P-create-version-zero` not run. | Possible lost first write | Run probes (M3); owner accepts or finds a platform way. | owner | open | v0.1.x |
| E-probes | E | Contract and perf probes (`P-charset`, `P-created`, `P-409`, ... `P-total`) not run; design Appendix C empty. | Custom Object assumptions unproven (Q-E3) | `npm run test:integration` against a scratch project (M3). | agent | open | blocks release |
| N-sort | N, E | `createdAt` predicate/sort not probed (OQ-N3). | Backoffice order | M3 probes. | agent | open | v0.1.x |
| S-iframe | V, S | Can `take_snapshot`/`evaluate_script` reach the cross-origin iframe of the Custom View? | Cards E2E-S-* may be unrunnable | First real run. | agent | open | v0.1.x |
| V-selectors | V | Selectors, `emulate` values, tunnel tool and `mc-scripts start` port option are unconfirmed (V notes TODOs). | Cards may need edits | First real run. | agent | open | v0.1.x |
| P/Q/S-csp | O, P, S | CSP completeness (blob and data images, Nimbus fonts, no `unsafe-eval`) unverified in a browser. | UI breakage | E2E-O-04, P-15, S-02. | agent | open | v0.1.x |

## 3. Owner decisions (defaults stated; ask once, in one message, with M1, M2, M12, M13, M15)

| Id | Source | Question | Default used | Consequence | Owner | Status | Target |
|---|---|---|---|---|---|---|---|
| RQ12 | Z | Version and tag name; certify publicly? | `0.1.0` / `v0.1.0`; private connector (Q14 decided) | none | owner | resolved (Q14) | - |
| RQ13 | Z | Where is the internal evidence archived? | A private archive outside git | evidence loss | owner | open | v0.1.x |
| RQ10 | W | Where do discussions happen; how is a vulnerability reported privately? `SUPPORT.md` says "when enabled". | placeholder text | Published wording wrong | owner | open | blocks release (security contact) |
| RQ11 | W | Keep the scrubbed Managed MCP Gemini known-issues note? | not written | none | owner | open | v0.1.x |
| W-Q3 | W, A | Published package names versus dev names (`ai-assistant-*` vs `@commercetools-labs/*`). | table added to `docs/architecture.md` (r2-docs, from the Q-impl-60 description) | owner confirms the published names | owner | default-accepted-pending | v0.1.x |
| W-Q4 / Q-P3 | W, P | Keep Gravatar (hash of the user's e-mail sent to a third party)? | keep, documented | privacy | owner | default-accepted-pending | blocks release (privacy decision) |
| W-Q5 / Q-E5 | W, E | `userLabel` (e-mail) stored in clear text and as `createdBy`. | keep, documented | privacy | owner | default-accepted-pending | blocks release (privacy decision) |
| W-Q6 | W, F | `GEMINI_AGENT_MODEL_NAME` is declared but the agent tier is unused. | reserved | confusing config | owner | open | v0.1.x |
| W-Q7 | W | `ENCRYPTION_KEY` change only by a manual redeploy. | as is | rotation procedure manual | owner | default-accepted-pending | backlog |
| Q-Q5 | Q | `GET system-prompt` is open to every verified member; only PUT is admin. Intended? | open read | prompt readable by non-admins | owner | open | blocks release (security question) |
| Q-Q4 | Q | A user not connected to the identity MCP cannot reach `/backoffice`; an admin who cannot connect is locked out. | as legacy | admin lock-out | owner | open | v0.1.x |
| Q-Q3 / Q-Q2 | Q | Backoffice link hidden behind Advanced accordion; backoffice newest-first by `createdAt`. | as built | UX | owner | default-accepted-pending | v0.1.x |
| N-Q1 | N, E | Backoffice order by `createdAt`, not `updatedAt`. | createdAt | UX | owner | default-accepted-pending | backlog |
| I-Q2 | I | Should `PUT` rebind delete and revoke old token records? | no (stale, unread) | stale ciphertext | owner | open | v0.1.x |
| OQ-I5 | I | Unbind sweeps all users' MCP tokens: confirm. | yes | none | owner | default-accepted-pending | - |
| OQ-I3 / OQ-I4 / OQ-I7 | I | http localhost callback; typed stream notice; completion handshake (login-CSRF hardening). | none of them | hardening | owner | open | backlog |
| OQ-I6 | I | Settings record carries encrypted `client`, `discovery`, `majorVersion`. | yes | none | agent | open | v0.1.x (confirm by test) |
| E-Q2 | E, I | aad constant `IDENTITY_CLIENT_AAD='default'`. | resolved by the cleanup change (`crypto/aad.ts`) | none | - | resolved | - |
| E-Q3 | E | `listByUser` in-memory flag filtering cost (benchmark 7.4 not run). | accept | slow drawer for heavy users | owner | open | v0.1.x |
| Q-E4 | E | Sweep auth states from a scheduled `job`? | no (opportunistic) | stale rows | owner | default-accepted-pending | backlog |
| G-Q2/Q3/Q4 | G | Suggestions use plain sessions only; list capped at 500 sessions; system-prompt change visible after `SETTINGS_CACHE_TTL_MS` (5 s). | accept | UX limits | owner | default-accepted-pending | v0.1.x |
| OQ-G3 / OQ-G4 | G | Keep "messages of last matching session on flag mismatch"; admin-only system-prompt write and 20 000-character cap. | keep | none | owner | default-accepted-pending | - |
| OQ-G1, OQ-G2, OQ-G5 | G | Method names; `getModel` shape; featureFlags predicate. | resolved in code (G notes); OQ-G5 untested (M3) | none | agent | resolved / open | v0.1.x |
| H-Q1/Q2/Q3/Q5 | H | Source names as contract; entity links in custom view; stream route body limit (100 kb); Continue chip after time-limit. | as built | UX | owner | default-accepted-pending | v0.1.x |
| OQ-H4 | H | Analyzer size/args interpolation bugs kept. | keep | cosmetic | owner | default-accepted-pending | backlog |
| OQ-H6 | H | Budget 270 s / reserve 30 s. | resolved (Q21) | - | - | resolved | - |
| OQ-H1 / OQ-H3 | H | Budget keys declared in `connect.yaml`; `getModel` shape. | resolved in code | - | - | resolved | - |
| H-prompts | H | Stale legacy sub-agent prompt text; no routing keyword table; `onFinish` skips continued assistant messages. | as ported | routing quality may drop | owner | open | v0.1.x (E2E comparison) |
| J-Q1 | J | Keep Stripe toolkit 0.7.12 (peer `ai ^4`, `legacy-peer-deps`) or move to Stripe's hosted MCP (after 2026-10-31)? | keep 0.7.12 | long-term dependency | owner | open | backlog |
| J-Q2 | J | Stripe menu lists 24 names, toolkit has 21 tools. | keep 24 | four dead menu entries | owner | open | v0.1.x |
| OQ-J2 | J | Algolia host allow-list or syntactic guard (SSRF). | syntactic guard | SSRF residual | owner | open | blocks release (security question) |
| OQ-J1/J3/J4/J5/J6 | J | Resolved in the design (memo, secured config, Contentstack region, secured Algolia URL, open providers endpoint). | - | - | - | resolved | - |
| K-Q2 | K | Caret `@commercetools/nimbus ^3.5.1` in frontends vs exact pin in `nimbus-mcp`; only the pin test guards it. | accept | drift | owner | open | v0.1.x |
| K-Q3 / OQ-K2 | K | Source order 61 is a guess; Nimbus version 3.5.1 vs 3.6.0. | follow O's pin | none | agent | open | v0.1.x |
| OQ-K3 / OQ-K4 | K | Resolved (no per-agent scoping; status route added). | - | - | - | resolved | - |
| OQ-L3 / L-Q4 | L | Billing enabled on the GCP project (load-job fallback exists). | required | slower free tier | owner | open | v0.1.x |
| OQ-L5 | L | Default caps (500 rows, 200 MB billed, 20k rows per offload, 7-day expiry). | accept | none | owner | default-accepted-pending | v0.1.x |
| OQ-L2 / OQ-L4 / OQ-L6 | L | Resolved. | - | - | - | resolved | - |
| L-script | L | `service/scripts/check-gcp-cleanup.mjs` (E2E-L-07) and integration tests not written; `/files` frontends must use blob URLs. | E2E-L-07 SKIPPED(script missing) | cleanup unproven | agent | open | v0.1.x |
| OQ-M1 | M | Keep container key `shared-composed-pages`. | keep | none | owner | default-accepted-pending | - |
| M-Q2 | M, H | Source name `commercetoolsUI` (code) vs `commercetools-ui` (spec). | code name | doc drift | owner | open | v0.1.x |
| OQ-M3 / OQ-M4 | M | Who regenerates the surface manifest; deny-list errors vs warnings. | check script; hard errors | none | owner | default-accepted-pending | - |
| M-adopt | M, P, R | Frontend adoption of the contract check: mc-app done by the cleanup change; composed-apps still has its own path and key constant; `mc-app/src/types/composed-page.ts` header says "Current version: 4.0". | drift | R's area | agent | open | v0.1.x |
| N-Q2 / N-Q3 | N | Feedback write concurrency 8 not 4; detail read by one key-sorted query. | accept | none | owner | default-accepted-pending | - |
| OQ-N1 / OQ-N4 / OQ-N5 | N | Resolved (signatures; keep forever; admin read with audit lines). | - | - | - | resolved | - |
| N-unused | N | Unused feedback helpers (`FEEDBACK_CHUNK_BYTES`, `buildSnapshotChunks`, ...) remain. | dead code | cleanliness | agent | open | v0.1.x |
| Q-O2 / O-Q3 | O, R | Scope trim (about 50 commerce scopes kept in mc-app/composed-apps); composed-apps keep MCP scopes (B superset) vs R drops them. | keep legacy | over-broad scopes | owner | open | blocks release (least-privilege review, security) |
| Q-O4 / Q-O5 | O | Bootstrap workspace prefetch (default no); view `connect.yaml` keys (skill default). | default | none | owner | default-accepted-pending | - |
| O-Q4 | O, A | Package names `ai-assistant-*` accepted (AQ1). | accept | docs | owner | default-accepted-pending | v0.1.x |
| Q-P1/Q-P2/Q-P4/Q-P5/Q-P6 | P | Combined session endpoint (no); initial tool-call-logs mode `none` vs service default `all`; session metadata; attachment limits (none); data sources removed. | defaults | UX | owner | default-accepted-pending | v0.1.x |
| P-Q2 / P-Q3 | P, Q | Two `GET session/all` on first visit; tool menu enables every group (no provider status feed). | accept | cosmetic / UX | owner | open | v0.1.x |
| P-nottested | P, Q, S | No unit tests for `session.tsx`, `useNextPrompts`, `ConnectProvider` gate order, `useIdentityStatus`, `thread-list` filters, S session context; Q leftovers: data-sources comment and a bigquery label. | only E2E cards cover them | regressions | agent | open | v0.1.x |
| RQ4 | R | Keep legacy manage scope set in the Pages app. | keep | scope breadth | owner | open | blocks release (with Q-O2) |
| RQ5 | R | No delete/publish toggle in the Pages app. | none | feature parity | owner | default-accepted-pending | backlog |
| R-createdBy | R | `createdBy` may hold an e-mail (PII); list does not show it. | accept | privacy | owner | open | v0.1.x |
| R-phase2 | R, U | R edited U's `config.mjs` (phase 2 has three keys). | accept | cross-change edit | owner | open | v0.1.x |
| R-fetchMore | R | `fetchMore` merging and `sort` on Custom Objects unverified. | UI | E2E-R-01 | agent | open | v0.1.x |
| RQ6 / RQ7 | S | Per-host-URL session scoping; 65 locators kept. | keep | UX | owner | default-accepted-pending | - |
| S-Q1..Q5 | S | Body copy of `featureFlags`; `view_mcp_servers` kept in the view; `data:` image CSP; "New chat" button; generic starters. | as built | UX | owner | default-accepted-pending | v0.1.x |
| RQ8 | V | Scratch project and two users A and B. | decided (Q12/Q46) | needs M3, M10 | owner | resolved (needs steps) | - |
| RQ9 | V | Tunnel tool (`cloudflared` default, M18). | default | none | owner | open | v0.1.x |
| V-Q2..Q5 | V | `data-testid` hooks in P/Q/S; Stop button in the composer; instance id in `/service/status`; plain `redeploy` command in `connect.mjs`. | none added | cards less robust (E2E-H-05 reloads the page) | owner | open | v0.1.x |
| V-id-drift | V | Id numbering of cards differs from V's design (designs of D, H, J, K, L, M, N, Q, U left as written). | cards follow owning changes | doc drift | agent | open | v0.1.x |
| V-stale-text | V | Stale spec text: P 20.9 (feedback submit answers 201, spec said 200), U/V D11 "verified e-mail", V 3.1 audience as `.../service`. | corrected (r2-docs): P 20.9 now 201, V 3.1 uses the origin only; the D11 e-mail wording was already replaced by the user-id decision | none | agent | resolved | - |
| V-manual | V | `plans/manual-steps.md` M8/M8a text not updated by V and the amendments file does not exist in the tree (not addressed). Done in r2-docs: scrub pass in `collect-evidence.sh` (`scripts/e2e/scrub-evidence.mjs`), seeds `large-snapshot` and `sessions-many` (`scripts/e2e/seed.mjs`, `e2e/fixtures/seeds/`), both unit-tested; neither was run against a project. | doc gap for the manual-steps text only | none | agent | partly resolved | v0.1.x |
| U-Q1..Q4 | U | Sandbox only for v1; region/project for rehearsals; staging repo and `connect-mu` grant; is a failing `postDeploy` allowed to mark `Failed`; `.eslintrc` exception for `connector/env.ts`. | sandbox only | rehearsal blocked | owner | open | blocks release (M15) |
| U-cli | U | Repeated `--configuration` flags, `--startDate` time zone, "not found" text of `connectorstaged describe`, Deployment JSON fields are assumed. | unit-tested with a fake | script may break on the real CLI | agent | open | blocks release |
| U-todos | U | TODO(L), TODO(J), TODO(E) markers: resolved by the cleanup change; `post-deploy: gcp analytics` self-check never creates dataset/bucket. | warnings only | bootstrap manual | owner | open | v0.1.x |
| U-lag | U | Log ingestion may lag the `Deployed` status: `finalize` can miss `post-deploy: FAILED`. | false negative | read the logs by hand | agent | open | v0.1.x |
| D-Q1..Q3 | D | `ADMIN_USER_IDS` charset `[A-Za-z0-9._:-]{1,128}` kept; optional `MC_CLOUD_IDENTIFIER` override; 403 on project mismatch UX; the admin decision is logged with the user id at debug level (conflicts with "never log ids"). | as built | privacy at debug level | owner | open | v0.1.x |
| D-unverified | D | JWKS first-request latency, clock skew, real claim name `${iss}/claims/project_key` verified only against library source and test kit. | auth could fail on a live gateway | E2E-D-01/02 (M8, M10) | agent | open | blocks release |
| D-config | D | Middleware reads `readConfiguration()` per request, not the `createApp(config)` argument. | test gotcha | document | agent | open | v0.1.x |
| C-Q2 | C | `ENCRYPTION_KEY` and `GCP_SA_KEY_BASE64` required in `connect.yaml` but `readConfiguration()` requires them only through E and F (resolved in those changes). | - | - | - | resolved | - |
| C-keys | B, C | Keys read by the service but not declared in `connect.yaml` (`PORT`, `LOG_HTTP`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS`, `PERSISTENCE_DRIVER`, `MC_AUTH_DISABLED`) cannot be set on Connect. | by design, documented | none | owner | resolved | - |
| B-Q2 | B | BQ1 model ids unverified (see Q-F2); BQ3 entry-point defaults; npm for the service vs yarn for frontends (D-B3); `required: false` with default on `CHAT_SERVICE_ENDPOINT_URL` untested by `validate`. | defaults | see Z-03 | owner | open | v0.1.x |
| A-Q | A | AQ1 dev names and holder wording; exact framing-word policy patterns not compared with the private policy; year 2026 in headers. | defaults | gate may differ | owner | open | v0.1.x |
| X-Q | X | Publish `plans/implementation/*` (kept internal), publish `e2e/`, ack of 17 warnings, commit author/message (XQ2), private token list (XQ3, M17), archive step (Q7). | internal | see Z-05 | owner | open | blocks release |
| Q1 (owner) | plans | Change T (withdrawn). | not part of v1 | none | owner | resolved | - |
| Q-P-eq | W | Documentation gaps: unused `agent` tier, undeclared keys, `configure` accepts few keys, no hot reload of `ADMIN_USER_IDS`, correlation id not echoed, session delete keeps feedback, no data-deletion API, CSV-only export, public image mode only for a bucket the service creates, JWKS timeout unread, permission names never seen in a Merchant Center. | documented | known limitations | owner | open | v0.1.x / backlog |
| W-todos | W | Re-read all docs after the first sandbox rehearsal; screenshots. Written in r2-docs: analyzer window, composed-page caps and export caps (`docs/api.md`), Stripe pin note, known-issues note, "Using the assistant" guide (no screenshots), "adding a store" guide, package-name table. Still open: ledger rows partial or not done (B PF1-PF8, F location guidance, H diagram, K smoke, motion README). | docs incomplete | usability | agent | open | v0.1.x |
| W-ledger-C | W | Known-issues note for Managed MCP schemas that Gemini rejects. | written as a neutral "Known issues" section of `docs/operations.md` (r2-docs); the owner can still ask for a separate file | - | owner | resolved | - |
| npm-audit | C and later | `npm audit` findings and EOL ESLint 8 / typescript-eslint 5 untriaged. | dependency hygiene | triage before publication | agent | open | v0.1.x |
| ai-dups | F | Two copies of `google-auth-library` (Storage's own); `@ai-sdk/*` transitive providers present in `node_modules`. | harmless | hygiene | agent | open | backlog |

## 4. E2E rows that are SKIPPED or NOT RUN

There is no E2E report, so the list is the whole catalogue: all 147 cards of `e2e/` (C 2, D 6, E 3, F 3, G 8, H 8, I 8, J 6, K 5, L 8, M 6, N 6, O 6, P 16, Q 16, R 9, S 12, U 6, V 13) are NOT RUN. Blocking manual steps: M3, M4, M5, M6, M7, M8, M10, M11, M14, M15, M16 (secret-dependent J cards additionally M21; destructive tier needs `E2E_ALLOW_DESTRUCTIVE=1`).
