#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { echo "usage: LABS_PUBLISH_DIR=<dir> scripts/labs-gate.sh ossify|ossify-apply|gate [extra args]"; }
[ "${1:-}" ] || { usage; exit 2; }
DIR="${LABS_PUBLISH_DIR:-}"
if [ -z "$DIR" ] || [ ! -f "$DIR/ossify.mjs" ] || [ ! -f "$DIR/gate.mjs" ]; then
  echo "LABS_PUBLISH_DIR must point at the directory containing ossify.mjs and gate.mjs" >&2; usage >&2; exit 2
fi
cmd="$1"; shift
case "$cmd" in
  ossify)       exec node "$DIR/ossify.mjs" --repo "$ROOT" "$@" ;;
  ossify-apply) exec node "$DIR/ossify.mjs" --repo "$ROOT" --apply "$@" ;;
  gate)         exec node "$DIR/gate.mjs" --repo "$ROOT" "$@" ;;
  *) usage; exit 2 ;;
esac
