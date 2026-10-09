> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

# Owner questions raised by changes A, B, U, X

Ids are local to this inbox. "Refines" names the question in `plans/owner-questions.md` it sharpens (if any). Each has a default the agent uses if unanswered.

| Id | Question | Refines | Default used | Affects |
|---|---|---|---|---|
| AQ1 | Confirm the development package names `ai-assistant-service`, `ai-assistant-mc-app`, `ai-assistant-composed-apps`, `ai-assistant-mc-view-app` (ossify turns them into `@commercetools-labs/...`) and the licence holder text `commercetools GmbH and the commercetools-labs contributors` (fixed by the publication tooling). | Q10 | As stated | A, B, X |
| AQ2 | Treat `.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/` as internal-only and remove them from the published commit together with `plans/` and `openspec/`? | Q16 | Yes, remove | A, X |
| BQ1 | Gemini model ids used as `connect.yaml` defaults (`gemini-3.8-flash`, `gemini-3.5-flash-lite`) were copied from the legacy `.env.example` and are unverified. Which ids should be the defaults? (Spec F will verify on Vertex AI.) | Q9 | Keep legacy values until F verifies | B, F |
| BQ2 | Service uses npm (`package-lock.json`) because the lifecycle commands are npm; the three frontends keep yarn 1 as in the legacy repo. OK, or one package manager everywhere? | - | npm for service, yarn for frontends | B, C, O |
| BQ3 | Custom Application / View registrations: entry-point paths `ai-assistant` and `ai-assistant-pages`, names `AI Assistant`, `AI Assistant Pages`, view `AI Assistant`. Any naming constraint (entry points must be unique per Merchant Center region)? | Q10 | As stated | B, U, O, S |
| UQ1 | Connect target for v1: sandbox only (script supports `production` behind `--confirm-production`). Confirm. | Q14 | Sandbox, private connector | U, Z |
| UQ2 | Which Connect region/project do the rehearsals run in? | Q12 | `us-central1.gcp`, the scratch project from M3 | U, V |
| UQ3 | A private staging git repository is needed before the public repo exists (Connect clones the repo by URL and tag). Which GitHub org/name, and who grants the machine user `connect-mu` read access? | M13 | An internal private repository created by the owner (M15) | U, V |
| XQ1 | Final confirmation that `plans/`, `openspec/`, `.claude/`, `CLAUDE.md` are removed from the public commit. | Q16 | Remove | X |
| XQ2 | Author identity and wording of the single public commit. | - | Publishing person's configured git identity; neutral message drafted in change X task 4.2 | X |
| XQ3 | Ask the labs tooling maintainers to add the two repo-specific customer-scenario tokens (listed in change X task 2.1) to the private `policy.json`, so the internal leak list can shrink. | - | Not requested; internal list used | X |
| XQ4 | Repository description text and name `commercetools/ai-assistant`. | Q10 | As stated | X |
