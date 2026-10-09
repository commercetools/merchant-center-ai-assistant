# Playbook F: GCP credentials and the Vertex LLM

Owning change: `f-gcp-credentials-and-vertex-llm`. F lists no Chrome ids of its own (its V.5 says the
user-visible proofs are `E2E-H-*` and `E2E-L-*`, with F's integration smoke suite as precondition).
These cards are reserved by the V design. They need the GCP service-account key (manual step M5); the
model availability of the configured model names in the chosen location was never verified without it.

### E2E-F-01 - Main model answers through the full stack
- Spec: f-gcp-credentials-and-vertex-llm / Vertex provider, main tier
- Tags: smoke, needs:M8, needs:service-account, needs:deployment
- Env: both
- Budget: 240
- Pre: `E2E-V-01` passed; `cd service && npm run test:integration` was run once with `service/.env.local` (the live smoke suite, skipped without a key) and its result is attached.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-f01: reply with the single word E2E-OK-<nonce>"
  4. MACRO WAIT-STREAM-DONE timeoutMs=120000
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-F-01/snapshot-final.txt"}
  6. MACRO ASSERT-CLEAN
- Assert:
  A1 [NET] the stream request answers 200 with `text/event-stream`.
  A2 [DOM] an assistant message exists and the composer is enabled again; no error banner.
  A3 [DOM] soft: the assistant text contains `E2E-OK-<nonce>`; on a miss repeat once in a new chat (FLAKE-PASS) per the LLM rules.
  A4 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session (`E2E-P-05` steps) or `cleanup.mjs --run $RUN`.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json, console.txt
- Status: NOT RUN

### E2E-F-02 - A broken service-account key fails fast without leaking it
- Spec: f-gcp-credentials-and-vertex-llm / key parsing and validation
- Tags: regression, negative, shell
- Env: local
- Budget: 120
- Pre: `cd service && npm run build`; port 8081 free.
- Steps:
  1. SHELL: `NODE_ENV=production GCP_SA_KEY_BASE64="not-base64!!" PORT=8081 node --env-file=.env.local build/index.js; echo "exit=$?"`
  2. SHELL: `NODE_ENV=production GCP_SA_KEY_BASE64="$(printf '{"type":"service_account"}' | base64)" PORT=8081 node --env-file=.env.local build/index.js; echo "exit=$?"`
- Assert:
  A1 [SHELL] both runs exit non-zero before listening, and the message names `GCP_SA_KEY_BASE64`.
  A2 [SHELL] the output contains neither the value used nor any part of the real key from `.env.local`.
- Cleanup: none.
- Evidence: sa-key-failures.txt
- Status: NOT RUN

### E2E-F-03 - Token usage is stored with the reply
- Spec: f-gcp-credentials-and-vertex-llm / usage metadata
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: a chat turn from `E2E-F-01` in the open session.
- Steps:
  1. MACRO RECORD-SESSION
  2. MACRO CAPTURE-FORWARD
  3. MACRO REPLAY-FORWARD GET /session/<sessionId>/messages null null
- Assert:
  A1 [NET] the assistant message in the response carries metadata with token usage numbers (input and output counts greater than zero); exact keys are recorded in the evidence file, not hard-coded here.
  A2 [NET] no message part contains a thought signature value or any credential.
- Cleanup: as `E2E-F-01`.
- Evidence: messages.json (parts truncated to 200 characters)
- Status: NOT RUN

## Coverage

- Vertex main tier end to end: `E2E-F-01`; key hygiene at startup: `E2E-F-02`; usage metadata: `E2E-F-03`.
- Not covered by a browser card: the `agent`, `lite` and `image` tiers individually (the image tier is `E2E-L-04`, the lite tier backs the digest and suggestions in `E2E-G-03` and `E2E-G-04`), thought-signature replay across tool steps (F's integration smoke), `countTokens` fallback to 0.
