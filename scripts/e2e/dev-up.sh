#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.
#
# Local environment for the E2E cards: a tunnel (the Merchant Center gateway cannot reach localhost),
# the built service on port 8080 and optionally one app dev server.
# Usage: bash scripts/e2e/dev-up.sh [--service-only] [--no-apps]
#   E2E_APPS=mc-app|composed-apps|mc-view-app selects the app (default mc-app). The three apps all
#   default to port 3001 and a Custom Application has one registered development URL, so they are
#   started one at a time.
# Needs: service/.env.local (manual step M3), `cd service && npm run build`, cloudflared (or set
# E2E_TUNNEL_URL to a tunnel you started yourself), and for the app the values of its .env file.
# Writes .e2e-service.pid, .e2e-app.pid, .e2e-tunnel.pid, .e2e-service.log and e2e/.env.e2e (git-ignored).
# The tunnel URL changes on every start: the service's CONNECT_SERVICE_URL and the app's CHAT_SERVICE_ENDPOINT_URL are
# rewritten and the app restarted. This script has not been exercised against a real tunnel yet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
SERVICE_ONLY=0
NO_APPS=0
for arg in "$@"; do
  case "$arg" in
    --service-only) SERVICE_ONLY=1 ;;
    --no-apps) NO_APPS=1 ;;
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done

PORT="${PORT:-8080}"
[ -f service/.env.local ] || { echo "service/.env.local is missing (manual step M3)" >&2; exit 2; }
[ -f service/build/index.js ] || { echo "service is not built: cd service && npm run build" >&2; exit 2; }

# 1. tunnel: reuse the running one on a service-only restart so SERVICE_URL stays the same
TUNNEL_URL="${E2E_TUNNEL_URL:-}"
if [ -z "$TUNNEL_URL" ] && [ "$SERVICE_ONLY" = 1 ] && [ -f e2e/.env.e2e ]; then
  TUNNEL_URL="$(grep -E '^SERVICE_URL=' e2e/.env.e2e | cut -d= -f2-)"
fi
if [ -z "$TUNNEL_URL" ]; then
  command -v cloudflared >/dev/null 2>&1 || { echo "cloudflared is not installed; start any tunnel to localhost:$PORT and set E2E_TUNNEL_URL" >&2; exit 2; }
  : > .e2e-tunnel.log
  cloudflared tunnel --url "http://localhost:$PORT" >.e2e-tunnel.log 2>&1 &
  echo $! > .e2e-tunnel.pid
  for _ in $(seq 1 60); do
    TUNNEL_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' .e2e-tunnel.log | head -1 || true)"
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done
  [ -n "$TUNNEL_URL" ] || { echo "no tunnel URL after 60 s, see .e2e-tunnel.log" >&2; exit 1; }
fi
echo "service origin: $TUNNEL_URL"

# 2. service: CONNECT_SERVICE_URL is the tunnel origin; the service derives its audience from it
if [ -f .e2e-service.pid ] && kill -0 "$(cat .e2e-service.pid)" 2>/dev/null; then
  kill "$(cat .e2e-service.pid)" || true
  sleep 1
fi
(
  cd service
  CONNECT_SERVICE_URL="$TUNNEL_URL" PORT="$PORT" node --env-file=.env.local build/index.js >"$ROOT/.e2e-service.log" 2>&1 &
  echo $! > "$ROOT/.e2e-service.pid"
)
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/service/status" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "http://localhost:$PORT/service/status" >/dev/null || { echo "service did not become healthy, see .e2e-service.log" >&2; exit 1; }

# 3. one app dev server
if [ "$SERVICE_ONLY" = 0 ] && [ "$NO_APPS" = 0 ]; then
  APP="${E2E_APPS:-mc-app}"
  case "$APP" in mc-app|composed-apps|mc-view-app) ;; *) echo "E2E_APPS must be mc-app, composed-apps or mc-view-app" >&2; exit 2 ;; esac
  if [ -f .e2e-app.pid ] && kill -0 "$(cat .e2e-app.pid)" 2>/dev/null; then
    kill "$(cat .e2e-app.pid)" || true
    sleep 1
  fi
  (
    cd "$APP"
    # composed-apps never talks to the service; the others need the gateway-reachable endpoint
    CHAT_SERVICE_ENDPOINT_URL="$TUNNEL_URL/service" npx mc-scripts start >"$ROOT/.e2e-app.log" 2>&1 &
    echo $! > "$ROOT/.e2e-app.pid"
  )
  echo "app $APP starting, see .e2e-app.log (the Merchant Center development URL of the app must point at it)"
fi

# 4. write the environment file (values only for this machine; git-ignored)
mkdir -p e2e
touch e2e/.env.e2e
grep -vE '^(E2E_ENV|SERVICE_URL)=' e2e/.env.e2e > e2e/.env.e2e.tmp || true
{ cat e2e/.env.e2e.tmp; echo "E2E_ENV=local"; echo "SERVICE_URL=$TUNNEL_URL"; } > e2e/.env.e2e
rm -f e2e/.env.e2e.tmp
echo "wrote e2e/.env.e2e (E2E_ENV=local, SERVICE_URL)"
