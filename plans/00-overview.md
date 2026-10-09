# 00 — Overview: migrating the multitenant AI Assistant to an open-source, single-tenant Connect connector

Status: DRAFT v1 (high-level plan). Written 2026-10-08. Owner questions: [owner-questions.md](./owner-questions.md). Manual steps: [manual-steps.md](./manual-steps.md).

## 1. Goal

Take the working **multitenant** AI assistant for the commercetools Merchant Center and republish it as a
**single-tenant, open-source `commercetools-labs` project** in this repository
(`/Users/behnam/code/commercetools-labs/ai-assistant`, to become `commercetools/ai-assistant` on GitHub), deployed
**only** through **commercetools Connect**.

Sources (read-only, never modified):

| Source | Path | Becomes |
|---|---|---|
| Frontends | `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app` | `mc-app/`, `composed-apps/`, `mc-view-app/` |
| Backend | `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service` | `service/` |
| MCP gateway | `.../multitenant-ai-assistant-router/nimbus-mcp-gateway` | embedded into `service/` (default; see D3) |

## 2. Hard requirements (from the owner)

| # | Requirement | Where it is handled |
|---|---|---|
| R1 | Keep **all features except multi-tenancy** | [01-source-inventory.md](./01-source-inventory.md) — every feature has a KEEP/CHANGE/DROP verdict |
| R2 | Services **and** all frontend apps are one **Connect** connector that follows the official `commercetools:commercetools-connect` skill | spec B, U |
| R4 | **No "cms"** — the old unmaintained `cms` package is not used | D12, Q2 |
| R5 | Follow `/presales:commercetools-labs-publish`: `@commercetools-labs/<name>` package names, MIT + SPDX header in every file, "unsupported" wording ×3, single clean commit, gate script | spec A, X |
| R6 | **No GitHub Actions** — everything goes through Connect | spec U (and a check in spec X that `.github/workflows` does not exist) |
| R7 | Firestore: drop it if not needed; if some data must persist use **Custom Objects** | D1, [05-data-persistence.md](./05-data-persistence.md) — **answer: yes, Firestore is not needed** |
| R8 | Google service account for Gemini: connector accepts the **whole SA JSON key, Base64-encoded** | D4, spec F |
| R9 | The owner should not have to do testing: **agent tests everything itself with the Chrome connector** | spec V, [04-workflow.md](./04-workflow.md) |
| R10 | Plan so a **junior developer** can pick up any spec | rules in `openspec/config.yaml`; [04-workflow.md §Definition of ready](./04-workflow.md) |

## 3. Key decisions (defaults; owner can override via questions)

| ID | Decision | Rationale | Question |
|---|---|---|---|
| D1 | **Firestore removed.** All durable state lives in commercetools **Custom Objects** (container prefix `ai-assistant-`), behind one repository interface. | Single project = no tenancy; Connect apps must be stateless and "support no persistence apart from in-memory" ([connect README]); Custom Objects are already used for composed pages. | — |
| D2 | In-memory caches (tool sets, tokens) stay but are **only an optimisation**; correctness must hold with N instances and scale-to-zero. | Connect scales horizontally; sandbox scales to zero (~15 s boot). | — |
| D3 | **Nimbus MCP gateway is embedded** in `service/` (spawn `@commercetools/nimbus-mcp` over stdio from the service process; no separate HTTP gateway, no shared-secret header). | Connect apps cannot discover each other's URLs; a second `service` app would need a manual URL hop + secret. Embedding deletes the Dockerfile, the secret and a deploy step. Costs ~tens of MB RAM (limit 512 MB). | Q3 |
| D4 | **Gemini via Vertex AI** (`@ai-sdk/google-vertex`) authenticated with `GCP_SA_KEY_BASE64` (securedConfiguration = Base64 of the full SA JSON). The same single credential serves Vertex (text and image models), BigQuery and GCS; all Google settings default and are configurable in `connect.yaml`; generated images stay in a private bucket and are streamed by the service (no signed URLs). API-key path (`GEMINI_API_KEY`) removed. | R8. | Q9 (decided) |
| D5 | Keep the **CommercetoolsIdentity Managed MCP** flow (current head of the source repo). Per-user OAuth tokens + PKCE state move to encrypted Custom Objects. | It is the shipped design; the older credential/team modes are already removed upstream. | Q5 |
| D6 | **Admin = `ADMIN_USER_IDS` only** (owner decision 2026-10-09, replaces the permission-group idea and the e-mail model). `ADMIN_USER_IDS` (connector `standardConfiguration`, comma-separated Merchant Center / Identity user ids) is the allowlist; the service decides `isAdmin` by membership of the verified forward-to JWT's `sub`/user id (change D) and returns it in `/auth/session`; no Merchant Center permission group exists. Empty list = nobody is admin (fail closed, startup warning). Admins learn their own user id from an always-visible read-only 'Your user ID' line (mc-app Settings > About, view-app footer), then set it with a `configure` redeploy. Any browser-sent e-mail is untrusted (display-only `userLabel`). | The legacy allowlist matched an *unverified* e-mail query parameter; a user id from the signed JWT cannot be forged and needs no extra sign-in flow. | Q6 (decided) |
| D7 | All three MC frontends pinned to the **same `@commercetools-frontend/*` version** (mc-app's 27.9.6), Node 22, independent installs per folder (no npm workspaces) as the Connect skill prescribes. | Source apps are on 24.11 / 25.1 / 26.1 / 27.9.6 — drift. | — |
| D8 | **Two-phase deploy** (deploy → read service URL → configuration redeploy that sets `MC_AUDIENCE` and `CHAT_SERVICE_ENDPOINT_URL` → register URLs in MC). | `CONNECT_SERVICE_URL` is only available inside `postDeploy`/`preUndeploy`, not to the running service; the service fails closed until `MC_AUDIENCE` is set. (Corrected by amendments, see 06.) | — |
| D9 | Single project: connector is installed **per commercetools project**; `CTP_PROJECT_KEY` comes from Connect env; the forward-to JWT's `projectKey` must equal it. | Replaces the whole tenant/project-document model. | — |
| D10 | Drop unused code (decided Q7, Q11): Anthropic/OpenAI providers, storefront-widget leftovers, legacy third-party widget endpoint, retired data-warehouse remnants, team-MCP, legacy credential encryption layouts. | Open-source hygiene; reduces review surface. | Q7, Q11 |
| D11 | Keep **Contentstack** agent (a third-party integration, unrelated to the old `cms` package). | R1; "no cms" refers to the unmaintained package. | Q2 |
| D12 | Backoffice (transcript/feedback browser) stays, single-project and admin-only (user id in `ADMIN_USER_IDS`), with `audit.admin_action` log lines; messages and feedback are kept forever (no retention job). | R1. | Q8, Q13, Q25, Q26 (decided) |
| D13 | 5-minute Connect request timeout is a **design constraint** for the SSE chat stream (budget + graceful finish). | [Connect deployment behavior]. | — |

## 4. Non-goals

- No changes to the source repos.
- No new product features (small hardening items are listed explicitly inside specs, e.g. BigQuery read-only guard).
- No multi-region matrix: one deployment per Connect region; regions are a Connect deployment choice.
- No GitHub Actions, Terraform, Dockerfiles or Cloud Run deploy scripts.

## 5. How to read the rest of `plans/`

1. [01-source-inventory.md](./01-source-inventory.md) — what exists today, per feature: KEEP / CHANGE / DROP.
2. [02-target-architecture.md](./02-target-architecture.md) — the Connect connector we are building.
3. [05-data-persistence.md](./05-data-persistence.md) — Firestore → Custom Objects data model.
4. [03-spec-dependency-map.md](./03-spec-dependency-map.md) — specs **A → Z**, dependency graph, build waves.
5. [04-workflow.md](./04-workflow.md) — how each spec is authored (`/opsx:*`), implemented and tested (Chrome).
6. [owner-questions.md](./owner-questions.md), [manual-steps.md](./manual-steps.md).
