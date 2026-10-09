# Tooling check (task 1.2) and blocked manual steps

| Tool | Result |
|---|---|
| `node -v` | v22.21.1 |
| `commercetools --version` | `@commercetools/cli/0.0.17` |
| `docker info` | client present, daemon not running: manual step M14 |
| Connect login / API client (M4, M16) | not used for this run; no `connect.mjs` command was run against Connect |
| `gh auth status` | not needed: no repository step was performed |
| `yarn` / `npm` | present; installs succeeded |
| Chrome DevTools attach (M8) | not used |
| scratch commercetools project, API client (M3) | not provided |
| Google service account (M5), Managed MCP server (M11), two Merchant Center users (M10), staging repository (M15), provider keys (M21), measurements (M22) | not provided |

Everything that needs one of the rows above is marked NOT VERIFIED with the step id in `acceptance.md`, `readiness.md`, `admin-access.md` and `open-items.md`.
