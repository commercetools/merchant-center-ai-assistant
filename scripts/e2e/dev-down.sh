#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.
#
# Stops what dev-up.sh started: the app dev server, the service and the tunnel.
# Usage: bash scripts/e2e/dev-down.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
for name in app service tunnel; do
  file=".e2e-$name.pid"
  if [ -f "$file" ]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      # stop the child processes of a dev server first (the pid is the shell or node wrapper)
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      echo "stopped $name ($pid)"
    fi
    rm -f "$file"
  fi
done
echo "ports still in use (expect none):"
lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null || true
lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null || true
