# Playbook C: service foundation

Owning change: `c-service-foundation`. The service has no UI here, so these cards are shell checks
that need no browser. They still run first because everything else depends on them.

### E2E-C-01 - Status endpoint and error shape
- Spec: c-service-foundation / status endpoint, error middleware, request context
- Tags: smoke, shell
- Env: both
- Budget: 60
- Pre: the service is running and reachable at `$SERVICE_URL`; no login needed.
- Steps:
  1. SHELL: `curl -si "$SERVICE_URL/service/status" -H "x-correlation-id: e2e-c01"`
  2. SHELL: `curl -si "$SERVICE_URL/service/health"`
  3. SHELL: `curl -si "$SERVICE_URL/service/does-not-exist"`
  4. SHELL: `curl -si -X POST "$SERVICE_URL/service/session"`
- Assert:
  A1 [SHELL] step 1 answers 200 with JSON `status: "UP"`, `service: "ai-assistant"`, a `version`, `persistence` (`custom-objects` on sandbox), `authConfigured: true` and a boolean `adminConfigured`; no secret value, no environment dump.
  A2 [SHELL] step 2 (`/service/health`, the alias) answers the same body.
  A3 [SHELL] step 3 answers 404 with a JSON body (`success: false`, a short `message`/`error`), no line starting with `at ` and no `Error:` stack text.
  A4 [SHELL] step 4 (no token) answers 401 JSON without a stack trace; `Cache-Control` is `no-store` on authenticated routes.
  A5 [SHELL] the service log of the run contains the correlation id `e2e-c01` on the request line of step 1 (local console or `commercetools connect deployment logs`); the response header `x-correlation-id` is recorded in the evidence if present (the service reads the header, echoing it back is not specified).
- Cleanup: none.
- Evidence: status.txt, not-found.txt, unauthenticated.txt
- Status: NOT RUN

### E2E-C-02 - Fail-fast configuration, one key at a time
- Spec: c-service-foundation / readConfiguration, boot-time validation
- Tags: regression, negative, shell
- Env: local (starts extra processes)
- Budget: 300
- Pre: `cd service && npm run build`; a copy of `service/.env.local` is available to read the key names (values are not printed); no other process uses port 8081.
- Steps:
  1. SHELL: `cd service && for key in $(grep -E '^\s+- key: ' ../connect.yaml | sed 's/.*key: //' | sort -u); do echo "$key"; done` : list the keys of the service in `connect.yaml` (required ones are marked `required: true`).
  2. SHELL: for each required key K, `env -u K PORT=8081 NODE_ENV=production node build/index.js` run for at most 10 s with the rest of the environment taken from `.env.local` (`node --env-file=.env.local`, then unset K).
  3. SHELL: `echo "exit=$?"` after each run.
- Assert:
  A1 [SHELL] every run exits non-zero before listening (nothing answers on 8081) and the message names the missing key K and no other secret.
  A2 [SHELL] the message does not contain any value taken from `.env.local` (grep the output for the first 6 characters of each secret value, expect no hit).
  A3 [SHELL] a run with all keys set starts and `curl -sf localhost:8081/service/status` answers 200.
- Cleanup: kill any process still listening on 8081.
- Evidence: config-failures.txt (key name and exit code per run, no values)
- Status: NOT RUN

## Coverage

- Service foundation: base path, error middleware, request context, status and health, configuration validation: `E2E-C-01`, `E2E-C-02`. Wire tests (`cd service && npm test`) are run by `E2E-V-08`.
- Not covered: the instance id in `/service/status` that the design of `v-e2e-chrome-testing` asked change C for does not exist in the implemented status body (see `plans/implementation/v-notes.md`); `E2E-V-05` uses the proxy log instead.
