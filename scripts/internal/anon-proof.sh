#!/usr/bin/env bash
# INTERNAL ONLY (listed in scripts/internal-paths.json, removed from the publication).
# Anonymous-clone proof: clone the single publication commit into an empty directory and run install,
# typecheck, tests and build for every package in a scrubbed environment (env -i: no LABS_PUBLISH_DIR,
# no cloud credentials, no .env files).
# Usage: scripts/internal/anon-proof.sh <source: local path or GitHub URL> <work dir> <log file>
# Env (optional): ANON_PROOF_SKIP_FRONTENDS=1 skips the three yarn frontends (quick rehearsal only).
# The log ends with `ALL STEPS PASSED` (skipped steps are named in the line) or `FAILED AT <step>`.
set -uo pipefail
SRC="${1:?source (local path or URL)}"
W="${2:?work dir}"
LOG="${3:?log file}"
case "$W" in /|"$HOME"|"$HOME"/) echo "refusing work dir $W" >&2; exit 2;; esac
rm -rf "$W"
mkdir -p "$W/home" "$(dirname "$LOG")"
: > "$LOG"
SKIPPED=()

# run <name> <dir relative to the clone> <command...>: scrubbed environment, log the exit code, stop on failure
run() {
  local name="$1" dir="$2"; shift 2
  echo "=== STEP $name" >> "$LOG"
  ( cd "$W/repo/$dir" && env -i HOME="$W/home" PATH="$PATH" CI=true bash -c "$*" ) >> "$LOG" 2>&1
  local rc=$?
  echo "=== EXIT $name $rc" >> "$LOG"
  echo "$name -> $rc"
  if [ "$rc" -ne 0 ]; then
    echo "FAILED AT $name" >> "$LOG"
    exit 1
  fi
}

echo "=== STEP clone" >> "$LOG"
if ! git clone --quiet "$SRC" "$W/repo" >> "$LOG" 2>&1; then echo "FAILED AT clone" >> "$LOG"; exit 1; fi
echo "commit $(git -C "$W/repo" rev-parse HEAD) commits $(git -C "$W/repo" rev-list --count HEAD)" >> "$LOG"
echo "=== EXIT clone 0" >> "$LOG"

# frontends: placeholder environment from .env.example (values only; no secrets exist in the file)
frontend() {
  local d="$1"
  run "$d install" "$d" "yarn install --frozen-lockfile"
  run "$d typecheck" "$d" "set -a; . ./.env.example; set +a; yarn typecheck"
  run "$d test" "$d" "set -a; . ./.env.example; set +a; yarn test"
  run "$d build" "$d" "set -a; . ./.env.example; set +a; yarn build"
  [ -f "$W/repo/$d/public/index.html" ] && echo "output $d/public/index.html present" >> "$LOG" || echo "output $d/public/index.html MISSING" >> "$LOG"
}

run "service install" service "npm ci --no-audit --no-fund"
run "service build" service "npm run build"
[ -f "$W/repo/service/build/index.js" ] && echo "output service/build/index.js present" >> "$LOG" || { echo "output service/build/index.js MISSING" >> "$LOG"; echo "FAILED AT service output" >> "$LOG"; exit 1; }
run "service test" service "npm test"

if [ "${ANON_PROOF_SKIP_FRONTENDS:-}" = "1" ]; then
  SKIPPED+=("frontends (ANON_PROOF_SKIP_FRONTENDS=1)")
else
  for d in mc-app composed-apps mc-view-app; do frontend "$d"; done
fi

run "scripts install" . "npm ci --prefix scripts --no-audit --no-fund"
run "scripts tests" . "node --test scripts/tests/*.test.mjs"
run "spdx-check" . "node scripts/spdx-check.mjs"
run "check-repo-rules" . "node scripts/check-repo-rules.mjs"
run "check-connect-layout" . "node scripts/check-connect-layout.mjs"

# connect validate needs the Connect CLI and a running Docker daemon (manual step M14)
if ! command -v commercetools >/dev/null 2>&1; then
  echo "=== STEP connect validate: SKIPPED (commercetools CLI not installed)" >> "$LOG"
  SKIPPED+=("connect validate: CLI missing")
elif ! docker info >/dev/null 2>&1; then
  echo "=== STEP connect validate: SKIPPED (docker daemon not running, M14)" >> "$LOG"
  SKIPPED+=("connect validate: docker daemon not running")
else
  # the CLI keeps its own auth state in HOME, so it gets the scrubbed home too; validate needs no login
  run "connect validate" . "commercetools connect validate ."
fi

if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo "ALL STEPS PASSED (skipped: ${SKIPPED[*]})" >> "$LOG"
else
  echo "ALL STEPS PASSED" >> "$LOG"
fi
tail -1 "$LOG"
