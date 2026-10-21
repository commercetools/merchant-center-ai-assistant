# Deployment runbook

This runbook installs, updates, rolls back and removes the AI Assistant connector with the commercetools Connect command line only. There are no GitHub Actions, no containers you build yourself and no infrastructure code: every deployment command goes through `node scripts/connect/connect.mjs`, which calls the official `commercetools connect ...` CLI.

Steps that only a person with the right access can do are marked `[MANUAL <id>]` and describe themselves, so this file can be followed without any other document.

Quick reference (five commands for a first install, after the prerequisites):

```
node scripts/connect/connect.mjs stage       # register the connector from your git repository and tag
node scripts/connect/connect.mjs publish     # make it deployable (sandbox needs a published connector)
node scripts/connect/connect.mjs deploy      # phase 1: create the deployment
node scripts/connect/connect.mjs finalize    # phase 2: set the service URL values, check, print the URLs
node scripts/connect/connect.mjs help        # all ten commands
```

Add `--dry-run` to any command to print what would run (secured values show as `***`) without running it.

## 1. Prerequisites

Tools on your workstation: Node.js 22, the Connect CLI (`npm install -g @commercetools/cli`, version 0.0.17 or newer) and Docker for `commercetools connect validate`.

- `[MANUAL M14]` Start Docker Desktop (or any Docker daemon). `commercetools connect validate` builds the applications with Buildpacks and needs a running daemon.
- `[MANUAL M4]` Log in the Connect CLI with an API client that has the scopes `manage_connectors`, `manage_connectors_deployments` and `manage_api_clients` (the last one lets Connect create the API client described by `inheritAs` in `connect.yaml`): `commercetools auth login --client-credentials --client-id <id> --client-secret <secret> --region <region> --project-key <key>`.
- `[MANUAL M16]` Put the same client id and secret, the project key and the Connect region into `scripts/connect/.env.connect` (copy `scripts/connect/.env.connect.example`; the file is git-ignored). The helper uses them for read-only REST calls (service URL and status) because the CLI has no machine-readable output.
- `[MANUAL M15]` Make the repository that Connect stages from readable: for a private repository, grant the GitHub user `connect-mu` read access, and put its clone URL and the release tag into `REPO_URL` and `REPO_TAG`.
- `[MANUAL M5]` Create the Google service account JSON key and Base64 it on one line. Roles: `roles/aiplatform.user`, `roles/bigquery.dataEditor`, `roles/bigquery.jobUser`, plus `roles/storage.admin` on the project (the service then creates the private image bucket) or `roles/storage.objectAdmin` on a bucket you create yourself. Command: `base64 < key.json | tr -d '\n'`. Put the result into `GCP_SA_KEY_BASE64`, then delete the local key file. Also set `ENCRYPTION_KEY` to a Base64 encoded 32-byte value (`openssl rand -base64 32`); changing it later makes stored identity tokens unreadable.
- `[MANUAL M6]` In the Merchant Center (Settings, Developer settings, Custom Applications) register the Custom Applications "AI Assistant" and "AI Assistant Pages" with a placeholder URL such as `https://placeholder.invalid`, and record each application id and its entry point URI path in `.env.connect` (`MC_APP_CUSTOM_APPLICATION_ID`, `MC_APP_ENTRY_POINT_URI_PATH`, `COMPOSED_APPS_CUSTOM_APPLICATION_ID`, `COMPOSED_APPS_ENTRY_POINT_URI_PATH`). Register first, fix the URL last.
- `[MANUAL M7]` Register the Custom View "AI Assistant" with a placeholder URL and record its id in `MC_VIEW_CUSTOM_VIEW_ID`. Its OAuth scopes must equal the ones in the view's configuration file.
- `[MANUAL M21]` Optional: provide the third-party provider credentials (Contentstack API key and management token, Algolia MCP URL, Stripe restricted key). They are Connect configuration: put them into `.env.connect` before `deploy`, or pass them later with `configure`. They are never entered in the app.
- `[MANUAL M10]` Create the two test users in the Merchant Center, user A (the administrator) and user B (not an administrator), and give both a Team with the app's ordinary Manage permission on the project. Open the deployed app as each user and read the "Your user ID" line (Settings, About). Set the allowlist with `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<user A id>`. Several administrators are comma-separated (at most 50; the value is one string). User B's id is deliberately not listed.

### Google Cloud settings

Every setting is optional; empty means the default. They are standard (not secret) configuration, set in `.env.connect` before `deploy` or later with `configure KEY=VALUE`.

| Key | Default | Meaning |
|---|---|---|
| `GCP_PROJECT_ID` | the `project_id` inside the key | Google Cloud project for Vertex AI, BigQuery and the bucket |
| `GCP_VERTEX_LOCATION` | `us-central1` | Vertex AI location of the Gemini models |
| `GCP_BIGQUERY_DATASET_ID` | `aiassistant` | dataset for offloaded tool results |
| `GCP_BIGQUERY_LOCATION` | `us-central1` | dataset location (immutable once the dataset exists) |
| `GCP_BUCKET_NAME` | `<project>-ai-assistant-images` | private bucket for generated images |
| `GCP_BUCKET_LOCATION` | `us-central1` | location when the bucket has to be created |
| `IMAGE_URL_MODE` | `private` | `private` streams images through the service, `public` makes objects publicly readable |

The `post-deploy: gcp analytics:` log lines tell you when the dataset or the bucket is missing or not reachable with the current roles. They are warnings only: chat works without analytics or images. To avoid granting `roles/storage.admin`, create the bucket yourself in the Google Cloud console (uniform bucket-level access, public access prevention enforced, location `GCP_BUCKET_LOCATION`) and grant the service account `roles/storage.objectAdmin` on that bucket only; the dataset can be created the same way.

## 2. Concepts

### Deployment types

| Type | Command | Needs | Behaviour |
|---|---|---|---|
| `sandbox` (default) | `deploy` | a published connector | scales to zero, so the first request after a quiet period is slower (cold start); cannot deploy a staged connector |
| `preview` | `preview` | a staged connector that is previewable | short-lived; scales to zero; delete it when testing ends (`delete --preview --yes`) |
| `production` | `deploy --type production --confirm-production` | a published connector and a non-trial project | refused without `--confirm-production` |

A Connect request to the service times out after 5 minutes, and a deployment can take up to about 15 minutes to reach `Deployed`.

### Why there are two phases

The public URL of the service exists only after the first deployment. The service reads it itself as `CONNECT_SERVICE_URL` (its origin is the audience that verifies the Merchant Center gateway token). The frontends cannot, so `CHAT_SERVICE_ENDPOINT_URL` (the origin plus `/service`) is baked into them. So:

1. `deploy` creates the deployment without the endpoint URL. If Connect does not provide `CONNECT_SERVICE_URL` to the running service, it is healthy but rejects every Merchant Center request (it fails closed); the `auth configuration` line of its log shows `audience: not configured`.
2. `finalize` reads the service URL, redeploys with `CHAT_SERVICE_ENDPOINT_URL=<origin>/service`, waits for `Deployed`, checks `GET <origin>/service/status` and prints the three application URLs.
3. `[MANUAL M9]` You paste those URLs into the Merchant Center registrations.

A redeploy is a partial merge: values you do not pass keep their current value, so `finalize` and `configure` never re-send secrets.

## 3. First install

1. `node scripts/connect/connect.mjs stage` creates the staged connector from `REPO_URL` and `REPO_TAG` (or updates it when it exists).
2. `node scripts/connect/connect.mjs publish`.
3. `node scripts/connect/connect.mjs deploy` (phase 1). It prints the command with secrets masked and does not wait.
4. `node scripts/connect/connect.mjs finalize` (phase 2). It waits up to 25 minutes, reads the postDeploy output, retries the smoke check for cold starts and prints the table headed `[MANUAL M9] paste these URLs into the Merchant Center registrations`.
5. Optional: `node scripts/connect/connect.mjs configure KEY=VALUE ...` for provider keys (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`). A provider is enabled only when all its required keys are set and valid (Contentstack: API key and management token; Algolia: the URL; Stripe: the secret key). A change needs this configuration redeploy; rotate a key by running it again. Check `node scripts/connect/connect.mjs logs --application service --since 30m` for the `post-deploy: providers` lines.
6. `[MANUAL M9]` Update the three registrations with the printed URLs.
7. Verify: `curl <service origin>/service/status` answers 200 with status `UP`, `authConfigured` true, and open the app in the Merchant Center.

### The first administrator

An empty `ADMIN_USER_IDS` means nobody is an administrator (fail closed; the service logs `ADMIN_USER_IDS is empty: no administrator` at start and `/service/status` shows `adminConfigured: false`). To bootstrap:

1. `deploy` and `finalize` (without `ADMIN_USER_IDS`).
2. Open the app in the Merchant Center and read the "Your user ID" line under Settings, About.
3. `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id>` (several ids: comma-separated, one argument).
4. After the instances restart, refresh the app: the administrator surfaces appear.

## 4. Update

Tag the new code in your repository, then `node scripts/connect/connect.mjs update-code --tag v0.2.0`. It runs `connectorstaged update`, `connectorstaged publish` and `deployment redeploy --updateConnector`, waits for `Deployed` and runs the smoke check. If the version number of the deployment did not change, the new tag probably failed to build: read the connector publishing report; the old code keeps serving.

## 5. Rollback

Run `update-code --tag <previous tag>`. If a new version fails to build, the previous code keeps serving.

## 6. Undeploy

`node scripts/connect/connect.mjs delete --yes` deletes the deployment. The `preUndeploy` script removes only its own probe object and logs `pre-undeploy: data retained in <container>`: sessions, messages, settings, tokens and feedback stay in commercetools Custom Objects so a reinstall finds them. To purge them deliberately, delete the Custom Objects of the containers whose names start with `ai-assistant-` yourself (for example with the Merchant Center's API tools); this is irreversible.

## 7. Fail-open and fail-closed

| Condition | Behaviour |
|---|---|
| `CONNECT_SERVICE_URL` not available to the service | the service rejects every Merchant Center request (fail closed); `finalize` does not fix it |
| project key in the gateway token differs from the deployment's project | 403 |
| `ADMIN_USER_IDS` empty | nobody is an administrator |
| a provider's keys are partial or absent | that provider is disabled, everything else works |
| Vertex AI answers 5xx during postDeploy | warning only |
| Vertex AI answers 4xx, malformed key, probe failure (including `commercetools unavailable`), audience mismatch | `post-deploy: FAILED <check>`; the deployment may still show `Deployed` |

## 8. Required scopes

The generated API client (from `inheritAs` in `connect.yaml`) has exactly `view_key_value_documents` and `manage_key_value_documents`. The Connect API client you log in with needs `manage_connectors`, `manage_connectors_deployments` and `manage_api_clients`; the REST helper requests only `view_connectors_deployments`.

## 9. Configuration

Deployment inputs (`scripts/connect/.env.connect.example`) and what they become:

| Variable | Goes to | Notes |
|---|---|---|
| `GCP_SA_KEY_BASE64`, `ENCRYPTION_KEY` | `service` (secured) | required; deploy only, not changeable with `configure` |
| `ADMIN_USER_IDS` | `service` (standard) | optional, comma-separated Merchant Center user ids, at most 50; empty means nobody is an administrator; changes need a `configure` redeploy and take effect after the instances restart |
| Google settings (table above) | `service` (standard) | optional |
| `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` | `service` (secured) | optional |
| `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID` | `service` (standard) | optional |
| `CONNECT_REGION` | `service.CTP_REGION` and the shared `CLOUD_IDENTIFIER` (one global item for all applications) | the cloud identifier is derived (`us-central1.gcp` gives `gcp-us`, `europe-west1.gcp` gives `gcp-eu`, `australia-southeast1.gcp` gives `gcp-au`, `us-east-2.aws` gives `aws-us`, `eu-central-1.aws` gives `aws-eu`) so they cannot disagree |
| application ids and entry point paths | `mc-app`, `composed-apps`, `mc-view-app` | from the registrations |
| `CHAT_SERVICE_ENDPOINT_URL` | set by `finalize` | origin plus `/service` |

Secret values are passed as `--configuration` arguments to the CLI, so they are visible in the local process list while the command runs. Use a personal workstation, never a shared machine. Everything the script prints has secured values replaced by `***`.

## 10. Troubleshooting

| Symptom | What to do |
|---|---|
| deployment status `Failed` | `node scripts/connect/connect.mjs logs`; a failed status needs a new deployment or support |
| `post-deploy: FAILED <check>` | read the reason on that line: `sa-key` (fix `GCP_SA_KEY_BASE64`), `vertex` (the hint names the role or model), `probe` (the reason ends with `(HTTP <status>)`, for example 403 when the API client lacks `manage_key_value_documents`, or with `(commercetools unavailable)` when the platform answered 5xx or timed out after the built-in retries; in the second case run the deployment again once the platform recovers), `audience` (see below) |
| the service answers 401 | the service has no audience: the `auth configuration` line of its log shows `audience: not configured`, so `CONNECT_SERVICE_URL` does not reach the running service (U5); `post-deploy: service origin <origin>` shows what the lifecycle script sees |
| first request is slow or `finalize` retries | sandbox and preview scale to zero (cold start); the smoke check retries up to 10 times |
| a redeploy shows old behaviour | use `update-code` (stage, publish, redeploy with `--updateConnector`); a plain `configure` does not move to new code |
| a provider shows "Not configured" in Settings | read the `post-deploy: providers` line for the missing key names, then run `configure` |
| `deploy` says the deployment already exists | use `finalize` or `configure`, or `delete --yes` and start again |
| `stage` cannot describe the connector | check the CLI login; an unrelated error never triggers a create |

## 11. Verified behaviour

These platform behaviours could not be confirmed without a real Connect deployment. They are filled in during the first sandbox rehearsal; until then each row is open and the scripts are written to tolerate either outcome.

| Id | Question | Result (date) |
|---|---|---|
| U1 | Is a non-required key without a default absent or empty in the environment? | open |
| U2 | Does a configuration redeploy re-bake `CHAT_SERVICE_ENDPOINT_URL` into the Merchant Center bundles? | open |
| U3 | Is `PORT` injected, or must the service use 8080? | open |
| U4 | Does `redeploy --updateConnector` apply changed `inheritAs` scopes? | open |
| U5 | Does Connect provide `CONNECT_SERVICE_URL` to the running service, not only to the lifecycle scripts, and with which path? The service depends on it for its audience | open |
| U6 | Does `npm ci` in `postDeploy` omit development dependencies? | open |
| U7 | How long do the sandbox deployment and redeploy take? | open |
| U8 | Is the creating project added to `privateProjects` of a private staged connector automatically? | open |
| U9 | Does a redeploy with an empty value clear a configuration key? | open |
| U10 | Is a comma-separated `ADMIN_USER_IDS` value kept as one string? | open |
