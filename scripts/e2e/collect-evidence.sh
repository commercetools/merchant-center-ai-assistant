#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.
#
# Moves the evidence of one E2E run from the OS temp directory (where the Chrome DevTools MCP is
# allowed to write by default) into plans/evidence/<run-id>/ and writes report.md.
# Usage: bash scripts/e2e/collect-evidence.sh <run-id>
# Overrides for tests: E2E_TMP (default $TMPDIR or /tmp), E2E_EVIDENCE_ROOT (default plans/evidence).
# Exit codes: 0 all scenarios passed or were skipped, 1 a scenario failed, 2 usage or safety refusal.
set -euo pipefail

RUN="${1:-}"
if [[ ! "$RUN" =~ ^[A-Za-z0-9_.-]{1,80}$ ]]; then
  echo "usage: collect-evidence.sh <run-id>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${E2E_TMP:-${TMPDIR:-/tmp}}"
SRC="${TMP_BASE%/}/e2e/$RUN"
EVIDENCE="${E2E_EVIDENCE_ROOT:-$ROOT/plans/evidence}"
DEST="$EVIDENCE/$RUN"

# Evidence is never published: refuse when any file below plans/evidence is tracked by git.
if [ -z "${E2E_EVIDENCE_ROOT:-}" ] && [ -n "$(git -C "$ROOT" ls-files plans/evidence 2>/dev/null)" ]; then
  echo "refusing: files under plans/evidence are tracked by git" >&2
  exit 2
fi

mkdir -p "$DEST"
if [ -d "$SRC" ]; then
  # rsync keeps the tree; fall back to cp when it is not installed
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$SRC/" "$DEST/"
  else
    cp -R "$SRC/." "$DEST/"
  fi
else
  echo "note: nothing to move, $SRC does not exist (evidence was written directly)" >&2
fi

set +e
node "$ROOT/scripts/e2e/report.mjs" "$DEST"
code=$?
set -e
exit "$code"
