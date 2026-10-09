# Administrator access proof (task 4.5)

Overall: **NOT VERIFIED on the staging deployment** (no staging deployment exists). Local proof only.

| Check | Result | Evidence / blocking step |
|---|---|---|
| `ADMIN_USER_IDS` present in the staging deployment configuration with `<user-id-a>` only (and `adminConfigured` true in `GET /service/status`) | NOT VERIFIED | Needs a deployment (M4, M15, M16) and two users (M10). U10 (comma list stays one string) is open. |
| E2E-V-03 (non-admin user), E2E-V-12 (forged e-mail, label, header), E2E-V-13 (own user ID line, bootstrap through `configure`, refresh) on the deployment | NOT RUN | Cards exist and lint clean (`command-log.md` C12). Needs M8, M10, M15. |
| Admin decided only by the verified token's user id; empty list fails closed; non-admin gets 403 `ADMIN_REQUIRED`; forged hints grant nothing | PASS (local) | Service wire tests `mc-admin`, `mc-bypass`, `admin-required-envelope` and the foundation gate that forbids identity query keys (C1). |
| No permission group in the registered applications' permission lists (only the default View/Manage pair) | PASS (local, source) / NOT VERIFIED (registered list) | `mc-app/custom-application-config.mjs` declares `permissions: [PERMISSIONS.View]` entries only; the view config says "Default View/Manage pair only"; grep for `assistant-admin` or `permission group` finds only that comment (C19). The Merchant Center settings page was not inspected (M6, M7, M8). |
| `ADMIN_USER_IDS is empty: no administrator` warning absent from the deployment logs; no e-mail in responses other than the display-only label | NOT VERIFIED | Needs deployment logs (M4, M15). |

A failing scenario here is a bug in change D, O or Q: open `/opsx:update`; never edit `ADMIN_USER_IDS` on the staging deployment to make a scenario pass.
