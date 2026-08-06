#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/.temp/build-runs"
LOG_ROOT="${TSUMO_DOTNET_LOG_DIR:-$(mktemp -d "$ROOT/.temp/build-runs/dotnet-XXXXXXXX")}"
mkdir -p "$LOG_ROOT"

packages=(engine cli tests)
projects=(Tsumo.Engine.csproj Tsumo.Cli.csproj Tsumo.Tests.csproj)
pids=()

for index in "${!packages[@]}"; do
  package="${packages[$index]}"
  project="${projects[$index]}"
  /usr/bin/time -v dotnet build "$ROOT/packages/$package/$project" --no-restore \
    >"$LOG_ROOT/$package.log" 2>&1 &
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
  echo "=== dotnet $package: $status ==="
  cat "$LOG_ROOT/$package.log"
done

echo ".NET build logs: $LOG_ROOT"
test "$failed" -eq 0
