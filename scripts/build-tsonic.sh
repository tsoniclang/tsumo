#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/.temp/build-runs"
LOG_ROOT="${TSUMO_BUILD_LOG_DIR:-$(mktemp -d "$ROOT/.temp/build-runs/tsonic-XXXXXXXX")}"
mkdir -p "$LOG_ROOT"

packages=(engine cli tests)
pids=()
node_options="${TSUMO_TSONIC_NODE_OPTIONS:---max-old-space-size=3072}"
build_timeout="${TSUMO_TSONIC_TIMEOUT:-15m}"

for package in "${packages[@]}"; do
  (
    cd "$ROOT/packages/$package"
    /usr/bin/time -v env NODE_OPTIONS="$node_options" timeout "$build_timeout" \
      node "$ROOT/node_modules/@tsonic/cli/dist/src/index.js" build --project tsonic.json
  ) >"$LOG_ROOT/$package.log" 2>&1 &
  pids+=("$!")
done

failed=0
for index in "${!packages[@]}"; do
  package="${packages[$index]}"
  if wait "${pids[$index]}"; then
    status="PASS"
  else
    status="FAIL"
    failed=1
  fi
  echo "=== tsonic $package: $status ==="
  cat "$LOG_ROOT/$package.log"
done

echo "Tsonic build logs: $LOG_ROOT"
test "$failed" -eq 0
