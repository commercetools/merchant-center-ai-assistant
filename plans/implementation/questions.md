# Consolidated open questions for the owner

Consolidated from the per-change notes (`<id>-notes.md` in this folder, section "Questions"), `plans/owner-questions.md` and `plans/manual-steps.md`. Duplicates are merged; every entry cites its source notes. Questions that `plans/owner-questions.md` already marks DECIDED are omitted (list at the end).

Priority scale:
- blocking: the v0.1.0 sandbox rehearsal, the first real user flow or publication cannot proceed or is likely wrong without an answer or a live check.
- should-decide: a default is implemented and works, but the choice has product, privacy or security weight; decide before publication.
- nice-to-know: low impact; the default is fine unless someone objects.

Change letters follow `plans/03-spec-dependency-map.md` (A-X; Z is written separately).

## 1. Auth and admin

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-01 | Identity-mode bind verdict: the live probe shows the protected-resource metadata is template-generated and mode-blind, so the bind-time verdict `auth2` may be impossible and `PUT managed-mcp-identity` could never succeed. Accept `client-credentials-as` when the AS metadata has a `registration_endpoint`, add an admin `force` flag, or keep strict? Needs a real identity-mode server (M11). | Without a successful bind the commercetools tools are unusable for everyone. | Strict: only verdict `auth2` is accepted. | I (i-notes Q1) | blocking |
| Q-impl-02 | Should an admin who cannot connect their own identity account still reach `/backoffice`? Today the connect gate wraps every route, so such an admin is locked out of review. | Admin lock-out. | Gate wraps all routes (legacy parity). | Q (q-notes Q4) | should-decide |
| Q-impl-03 | `GET system-prompt` is open to every project member on the service (only `PUT` is admin). Intended? | Prompt text readable through the API although the UI hides it. | Open read, admin-only write. | Q (q-notes Q5) | should-decide |
| Q-impl-04 | Debug log of the admin decision logs the `userId` at `debug` level (task 7.1), which conflicts with "user ids are personal data, never log them". Keep? | Privacy rule consistency. | Logged at `debug` only. | D (d-notes TODO) | should-decide |
| Q-impl-05 | `ADMIN_USER_IDS` entry charset: keep the stricter `[A-Za-z0-9._:-]{1,128}` (rejects an e-mail pasted by mistake) or relax to "no whitespace or control characters"? | A real id with another character would be rejected at start. | Strict pattern. | D (d-notes Q1), C | nice-to-know |
| Q-impl-06 | Separator tolerance of `ADMIN_USER_IDS`: `plans/owner-questions.md` Q6 says the service also tolerates `;` and whitespace; the code splits only on `,` and `;` (D follows the spec scenario "bad id" = one invalid entry) and U did not implement a whitespace fallback. Confirm which is wanted if Connect turns out to split or mangle the comma value (see verification V-04). | Fallback if the comma value does not arrive as one string. | `,` and `;` only. | D (d-notes gaps), U (u-notes U10), owner-questions Q6 | should-decide |
| Q-impl-07 | Is an owner-facing `MC_CLOUD_IDENTIFIER` override desirable, or rely on `CTP_REGION` only and drop the key? | A key that nobody sets is configuration surface. | Declared, optional, no default. | D (d-notes Q2), C Q1 | nice-to-know |
| Q-impl-08 | Is the generic text on a 403 project mismatch acceptable UX ("not available" would be friendlier)? | Frontend message for a wrong project. | Generic error. | D (d-notes Q3) | nice-to-know |
| Q-impl-09 | On rebind (`PUT`) should the old users' token records also be deleted and revoked like `DELETE` does? | Stale refresh tokens stay encrypted in storage until read or unbind. | Not deleted (users just need to reconnect). | I (i-notes Q2) | should-decide |
| Q-impl-10 | Identity logs no longer carry the user id (legacy logged `user=`). OK? | Troubleshooting versus privacy. | No user id in identity logs. | I (i-notes Q4) | nice-to-know |
| Q-impl-11 | Backoffice order: spec says newest `updatedAt` first, store sorts by `createdAt desc`. Accept createdAt for v1 or add an `updatedAt`/`lastModifiedAt` sort in E? | Review UX; the UI shows the order as received. | `createdAt desc`. | N (n-notes Q1), Q (q-notes Q3), W | nice-to-know |
| Q-impl-12 | Backoffice link in Settings > Advanced and all admin-only parts hidden behind the Advanced accordion: accept? | Discoverability. | As specified (Q-Q3). | Q (q-notes Q2) | nice-to-know |

## 2. GCP and models

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-13 | Are the model ids `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image` (and `gemini-2.5-flash` for the agent tier) still right and available in `us-central1`? Copied unverified from the legacy `.env.example`. | A missing model fails at the first chat request. Needs M5. | Names as in the spec. | B (b-notes Q2, BQ1), F (f-notes Q1, Q2), W (docs warn) | blocking |
| Q-impl-14 | `GEMINI_AGENT_MODEL_NAME` is declared and defaulted but no code path selects the `agent` tier (the orchestrator is flat). Remove the key, keep it reserved, or wire the split back in (owner-questions CQ7 "keep model split" is not decided)? | Dead configuration is documented as "reserved". | Reserved, unused. | W (w-notes Q6), F, H, owner-questions CQ7 | should-decide |
| Q-impl-15 | Is BigQuery billing enabled on the GCP project (IQ10)? | Without billing the slower load-job fallback is used. | Fallback exists. | L (l-notes Q4), owner-questions Q9+ | should-decide |
| Q-impl-16 | Are the BigQuery caps acceptable: 500 rows returned, 200 MB billed, 20k rows per offload, 7-day table expiry (OQ-L5)? | Behaviour change versus legacy for heavy queries. | Caps as listed. | L (l-notes Q3), owner-questions IQ list | nice-to-know |
| Q-impl-17 | Should `GCP_SA_KEY_BASE64` and `ENCRYPTION_KEY` stay `required: true` in `connect.yaml` while development and tests allow them absent? (E made `ENCRYPTION_KEY` required in all environments.) | Production semantics versus local convenience. | Required in `connect.yaml`. | F (f-notes Q3), C (c-notes Q2), E | nice-to-know |
| Q-impl-18 | Vertex location guidance (`us-central1` versus `global`, data residency) is only a pointer in `docs/privacy.md`. Provide the recommendation? | Residency statement for users. | `us-central1`. | W (ledger F row) | nice-to-know |

## 3. Connect deployment

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-19 | Which Connect region/project do rehearsals use, where is the private staging repo and who grants `connect-mu` read access (UQ2, UQ3, M15)? | The rehearsal cannot start without them. | None (needs owner input). | U (u-notes Q1), manual-steps M15 | blocking |
| Q-impl-20 | If the sandbox smoke shows that a Connect `service` cannot spawn the Nimbus child within 512 MB, switch to `NIMBUS_MCP_ENABLED=false` (kill switch, prompt carries built-in Nimbus guidance) or build the fallback gateway (K tasks 9.1/9.2)? Q3 (embed) is decided; the footprint is unverified. | Chat quality for UI-building turns. | Embedded child, kill switch available. | K (k-notes Q1), owner-questions Q3 | should-decide |
| Q-impl-21 | Pin `@commercetools/nimbus` exactly in the three frontends (today `^3.5.1`, resolves 3.6.0) so it cannot drift past the exact `nimbus-mcp` pin? | A silent mismatch between page generation and the Nimbus knowledge tools. | Caret range; `nimbus-pin.spec.ts` checks the generated manifest only. | K (k-notes Q2) | should-decide |
| Q-impl-22 | Source order 61 for the Nimbus source was a guess ("M's source is 60"). Confirm with M's final order. | Tool-menu and prompt order only. | 61. | K (k-notes Q3) | nice-to-know |
| Q-impl-23 | May a failing `postDeploy` mark the deployment `Failed`? Not documented by Connect. | `finalize` currently greps logs for `post-deploy: FAILED` regardless. | Scripts exit 1 on real failures. | U (u-notes Q3) | should-decide |
| Q-impl-24 | Are the Connect region string and the API-host spelling identical (`us-central1.gcp`) so `deploy` can pass `service.CTP_REGION=<CONNECT_REGION>`? | Wrong value fails at service start. | Identical; service validates against the same list. | U (u-notes Q2) | should-decide |
| Q-impl-25 | Keep the `.eslintrc.cjs` exception that lets `service/src/connector/env.ts` read `process.env`, or have `main()` pass `process.env` from an excluded file? | Lint rule purity. | Exception kept. | U (u-notes Q4) | nice-to-know |
| Q-impl-26 | Should the keys that are read but not declared in `connect.yaml` (`LOG_HTTP`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS`, `MC_APP_ENTRY_POINT_URI_PATH` is now declared) be declared so owners can set them on Connect? Same for the `configure` helper, which only accepts provider keys, Google settings and `ADMIN_USER_IDS` (`LOG_LEVEL`, model names, chat budget need a manual CLI redeploy). | Operability. | Not declared; documented in `docs/configuration.md`. | C (c-notes gaps), W (w-notes gaps), E | should-decide |
| Q-impl-27 | Should `ENCRYPTION_KEY` be changeable through `configure` (it refuses today; rotation needs a manual CLI redeploy)? | Key rotation procedure. | Deploy-only. | W (w-notes Q7), U | should-decide |
| Q-impl-28 | Should the helper `connect.mjs` get a plain `redeploy` command? E2E-V-04 needs a redeploy without a config change and uses the CLI directly. | Test ergonomics. | Not added. | V (v-notes Q5) | nice-to-know |
| Q-impl-29 | The chat stream route goes through the global `bodyParser.json()` (100 kb). Large annotation payloads or attached images (data URLs) above 100 kb get 413. Give the stream route its own limit (as N did for feedback)? | Image attachments may fail in real use (legacy had the same limit). | 100 kb. | H (h-notes Q3) | should-decide |
| Q-impl-30 | Digest and suggestions run after or around the response. If Connect freezes CPU after the response closes (R-G1), digests silently never arrive. Is a fallback "digest before the stream closes, 3 s cap" acceptable? | Session titles/digests and follow-up chips depend on it. | Detached work after response. | G (g-notes Q1) | should-decide |
| Q-impl-31 | First-write race: a never-written object (settings, session create) is an upsert, so two simultaneous first writers can lose one update. Acceptable, or find a create-only mechanism (probe `P-create-version-zero`)? | Data loss in a rare race. | Upsert; sequential create reports conflict. | E (e-notes Q1, G-E1) | should-decide |
| Q-impl-32 | Is the sweep cost of `listByUser` (reads up to 10 000 rows for a heavy user, filters flags in memory) acceptable? Benchmark 7.4 decides. | Latency for heavy users. | In-memory filtering. | E (e-notes Q3) | nice-to-know |
| Q-impl-33 | Request-body ceiling on Connect is unknown (CQ8); measured on first sandbox deploy together with the 10 MB feedback upload and the ~4 minute SSE turn (M22). Which result is acceptable if the gateway limit is lower? | Feedback snapshots up to 8 MiB, chat budget 270 s. | Spec values. | owner-questions CQ8, N (n-notes OQ-N2), H (h-notes Q4, OQ-H2) | blocking |
| Q-impl-34 | Feedback writes use `PERSISTENCE_CONCURRENCY` (8) not 4, and detail reads all chunks with one key-sorted query. Fine, or separate caps? | Platform rate limits. | Concurrency 8, one sorted query. | N (n-notes Q2, Q3) | nice-to-know |

## 4. Privacy

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-35 | Keep Gravatar (hash of the e-mail sent to gravatar.com, only in `mc-app`; removed from `composed-apps` and `mc-view-app`) for v1? Not marked DECIDED in `plans/owner-questions.md` (Q19). | Third-party request leaking a hash of a user e-mail; documented in `docs/privacy.md`. | Kept in `mc-app`, disclosed. | P (p-notes Q1), W (w-notes Q4), S, R, owner-questions Q19 | should-decide |
| Q-impl-36 | `mc-app` sends the signed-in user's e-mail as display-only `userLabel` (sanitised) and the composed page save stores it as `createdBy`, both in clear text. CQ5 decided the display-only label; is `createdBy` (and "does `createdBy` hold an e-mail", RQ13) acceptable? | Personal data at rest. | Both stored; documented. | W (w-notes Q5), R (r-notes Q3), owner-questions CQ5 | should-decide |
| Q-impl-37 | There is no API to delete feedback or a user's data, and deleting a session does not delete its feedback (retention decided: forever). Is a data-deletion path needed before publication? | GDPR-style requests. | None; "delete the Custom Objects yourself". | W (w-notes gaps), owner-questions Q13 | should-decide |

## 5. Product behaviour

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-38 | Stripe toolkit: keep 0.7.12 (peer `ai ^4`, installed with `legacy-peer-deps`) long term, or move to Stripe's hosted MCP (spike: 0.9.0 is a different product)? Also confirm Connect's build honours `service/.npmrc`. | Dependency hygiene and upgrade path. | Pinned 0.7.12 plus a schema shim. | J (j-notes Q1, spike 7.1) | should-decide |
| Q-impl-39 | Stripe menu lists 24 tool names but toolkit 0.7.12 provides 21 (`subscriptions.create`, `invoiceItems.read`, `paymentLinks.read`, `refunds.read` do nothing). Trim the menu or keep 24? | Misleading switches. | Kept as spec (24). | J (j-notes Q2) | should-decide |
| Q-impl-40 | Algolia SSRF guard: syntactic only (built) or also a host allow-list (OQ-J2)? | Security hardening of a user-supplied URL. | Syntactic guard. | J (j-notes Q3) | should-decide |
| Q-impl-41 | Should custom-view sessions get `create_entity_link` and the commercetools source prompt fragments? Legacy parity says no. | Custom view answers cannot link entities. | No links, no fragments. | H (h-notes Q2) | nice-to-know |
| Q-impl-42 | Time-limit notice is text only, no "Continue" chip (Q23 default). P decides the chip (OQ-H5). Keep? | UX when a turn hits the budget. | Text notice plus `data-turn-status`. | H (h-notes Q5), P, owner-questions Q23 | nice-to-know |
| Q-impl-43 | Source naming contract: the commercetools UI source is `commercetoolsUI` (H's agent keys) while M's spec says `commercetools-ui`; the Knowledge source is `commercetools-knowledge`. Confirm both. | Disabled-tool keys and the startup report use these names. | `commercetoolsUI`, `commercetools-knowledge`. | M (m-notes Q2), H (h-notes Q1) | nice-to-know |
| Q-impl-44 | Keep the composed pages container key `shared-composed-pages` (OQ-M1, Q41) or rename? | Stored data layout, hard to change later. | Kept, single constant. | M (m-notes Q1), owner-questions Q41 | nice-to-know |
| Q-impl-45 | Tool menu groups are always enabled, even when a provider is not configured (MCP config context was removed by decision Q4). Does `GET tools` list only usable providers? If not, feed `McpProviderStatus` into the menu. | Users can switch on tools that do nothing. | Groups always enabled. | P (p-notes Q3), Q (q-notes Q1) | should-decide |
| Q-impl-46 | Scopes: R dropped `manage_key_value_documents`, `view_mcp_servers`, `manage_mcp_servers` from the Pages app and keeps the legacy `view_*`/`manage_*` commerce set without `manage_discount_codes`; S keeps the two MCP scopes although unused; mc-app and composed-apps keep ~50 commerce scopes (Q-O2, Q42 default). Confirm, trim, or relax B's checker. | Least privilege for registrations. | As described. | R (r-notes Q1), O (o-notes Q2, Q3), S (s-notes Q2), owner-questions Q42 | should-decide |
| Q-impl-47 | The Pages app has no delete or publish toggle (RQ5, Q43 default). Confirm; and accept the `phase2` cleanup to three keys (R edited U's `lib/config.mjs`)? | Feature parity with mc-app; cross-change edit. | No toggles; three keys. | R (r-notes Q2, Q4) | nice-to-know |
| Q-impl-48 | `GET tool-call-logs` defaults to `all` on the service while the app shows `none` until loaded. OK? | Consistency of the logging default. | As described. | P (p-notes Q4) | nice-to-know |
| Q-impl-49 | First visit issues two `GET session/all`. Accept or upsert the new session locally? | Minor extra request. | Two requests. | P (p-notes Q2) | nice-to-know |
| Q-impl-50 | G: personalised suggestions use only plain sessions (no `customView` flag), the list returns at most 500 sessions per user (design said 2 000), and a system-prompt change may take up to `SETTINGS_CACHE_TTL_MS` (5 s) to reach another instance. Accept all three? | Heavy-user history in the drawer; prompt propagation. | As described. | G (g-notes Q2, Q3, Q4) | nice-to-know |
| Q-impl-51 | mc-view-app: (a) body copy of `featureFlags: {customView}` on session create, (b) `data:` images for the user's own attachments under the CSP, (c) a "New chat" button in the panel header, (d) page-aware starter suggestions instead of mc-app's generic ones. Confirm. | Custom View UX within "no floating actions". | (a) yes (b) `blob:` only (c) button added (d) generic. | S (s-notes Q1, Q3, Q4, Q5) | nice-to-know |
| Q-impl-52 | Keep the analyzer window of 10 messages and its quirks (Q22), and the system prompt injected once into the orchestrator (Q24)? Not DECIDED in owner-questions. | Behaviour change versus legacy routing quality. | Kept. | H, owner-questions Q22, Q24 | nice-to-know |

## 6. Frontend and test hooks

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-53 | Should the composer get a Stop button? It has none, so E2E-H-05 aborts by reloading mid-stream. | Real users cannot stop a long turn. | No Stop button. | V (v-notes Q3) | should-decide |
| Q-impl-54 | Should P, Q, S add `data-testid` hooks (`chat-status`, `chat-composer`, `chat-send`, `chat-stop`, `session-list-item`, `admin-config-save`)? A `data-status` would make stream-done detection robust. | E2E selectors rely on accessible names and the composer `disabled` state. | None. | V (v-notes Q2) | nice-to-know |
| Q-impl-55 | Should `/service/status` expose an instance id (the V design amendment)? E2E-V-05 relies on the proxy log. | Two-instance E2E test. | `status, service, version, persistence, authConfigured, adminConfigured` only. | V (v-notes Q4), C | nice-to-know |
| Q-impl-56 | Tunnel tool for local runs: `cloudflared` default (Q47); which one is installed or allowed (M18)? | `dev-up.sh` default. | `cloudflared`. | V (v-notes Q1), owner-questions Q47 | nice-to-know |
| Q-impl-57 | Languages: UI strings are hardcoded English, i18n files empty (Q15, not DECIDED). Keep English-only? | Scope statement for v1. | English only. | O, owner-questions Q15 | nice-to-know |

## 7. Publication

| Id | Question | Why it matters | Default implemented | From | Priority |
|---|---|---|---|---|---|
| Q-impl-58 | Where do discussions happen and how is a vulnerability reported privately (RQ10)? `SUPPORT.md` says "Discussions of this repository, when enabled" and "ask for a private channel". | A public repo needs a real channel. | Placeholder wording. | W (w-notes Q1), owner-questions Q48 | blocking |
| Q-impl-59 | Keep or drop the scrubbed `docs/known-issues/managed-mcp-gemini-schemas.md` (RQ11)? | Q49 default says keep. | Default applied in r2-docs as a neutral "Known issues" section in `docs/operations.md` (the normaliser in `service/src/schema/` still exists, so the note is accurate for the code). | W (w-notes Q2), owner-questions Q49 | nice-to-know |
| Q-impl-60 | Published package names: dev names are `ai-assistant-<suffix>`; `prepare-publish` ossify renames them to `@commercetools-labs/ai-assistant-{service,mc-app,composed-apps,mc-view-app,scripts,types-json-stable-stringify}`. Supply or confirm the "dev name to published name" table for the architecture doc. | W could not document published names. | Dev names documented; the table with the published names was added to `docs/architecture.md` from the description in this question, still to be confirmed. | W (w-notes Q3), X (x-notes ossify), A (AQ1 decided in Q10) | nice-to-know |
| Q-impl-61 | The 57 change-local question ids (CQ/GQ/HQ/IQ/NQ/OQ-M/RQ ids) cited in change documents: rewrite them to decided facts in the owning changes, or accept a "local ids" table in `plans/design-history.md`? | They block `scrub` (exit 1) and the clean leak scan. | Not touched. | X (x-notes Q1) | blocking |
| Q-impl-62 | Confirm `plans/implementation/` (these notes) stays unpublished (added to `scripts/internal-paths.json`). | Notes contain working detail. | Unpublished. | X (x-notes Q2) | should-decide |
| Q-impl-63 | Should `e2e/` and `scripts/e2e/` (agent playbooks that mention the git-ignored evidence folder and the "owner does not test by hand" framing) be public at all? They are scrubbed today. | Public repo content. | Published, scrubbed. | X (x-notes Q3) | should-decide |
| Q-impl-64 | Gate: the 17 warnings are one "ambiguous name" word for the dropped widget endpoint. Ack with the reason "named only to record that the legacy widget endpoint was removed; no customer data", or have the scrub rename it? Also confirm acking the REVIEW words (`tenant`, Firestore, "multitenant"; 392 hits, historical text). | Gate blocks on warnings without `--ack`. Maintainer decision at M12. | Not acked. | X (x-notes Q4) | blocking |
| Q-impl-65 | Commit author and message for the single public commit (XQ2): the script uses the configured git identity of whoever runs it; message is `scripts/internal/commit-message.txt`. Approve or edit. | Public attribution. | Runner's identity. | X (x-notes Q5) | should-decide |
| Q-impl-66 | Who supplies the private token list (store identifier, research-firm name, GCP project ids, UUIDs) for `leak-patterns.json` `blockPrivate` (XQ3, M17)? Empty today, so the leak scan covers only generic classes plus the gate's own customer names. | False sense of a clean scan. | Empty list. | X (x-notes Q6), manual-steps M17 | blocking |
| Q-impl-67 | Archive the changes (`openspec archive <id> --yes`) before publication: only A is complete; V and W have open boxes. Who does it and when? | The spec requires everything except X and Z archived. | Not archived. | X (x-notes Q7, TODOs) | blocking |
| Q-impl-68 | The role-word leak pattern was narrowed to person-addressed phrases (plain `\bowner\b` hit 412 legitimate "session owner" uses). Confirm instead of renaming the concept in 60+ files. | Deviates from the spec text. | Narrowed pattern. | X (x-notes Deviation 1) | nice-to-know |
| Q-impl-69 | Confirm the framing-word list (`FRAMING_WORDS` in `scripts/lib/files.mjs`, taken from the publication skill, only the first word verified against the real gate) matches the policy patterns. | Docs hygiene could miss a rule. | As taken from the skill. | A (a-notes Q2) | nice-to-know |

## Already decided in plans/owner-questions.md (omitted above)

Q2 Contentstack kept, Q3 Nimbus embedded, Q4 provider credentials in Connect configuration, Q5 identity-mode kept, Q6 admin = `ADMIN_USER_IDS` only, Q7 GECX widget dropped, Q8 backoffice kept with audit lines, Q9 Google settings and private images, Q10 naming and package managers (also AQ1, AQ2, BQ2, BQ3), Q11 Anthropic/OpenAI dropped, Q12 scratch project and users A and B (also Q46), Q13 retention forever (also Q25-27), Q14 sandbox plus private connector `0.1.0` (also Q50, UQ1), Q16 `plans/` and `openspec/` published scrubbed (also AQ2, XQ1), Q17 admin-only prompt/log mode/binding, Q21 chat budget 270 s + 30 s, CQ5 display-only `userLabel`.

Resolved by the integration cleanup (see `cleanup-notes.md`): aad constants for the stored identity client (E Q2), double retry layer (E gap), response envelope (N/G), temporary seams of I and U.
