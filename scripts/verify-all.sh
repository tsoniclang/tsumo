#!/usr/bin/env bash
# Full verification gate for a fresh checkout:
#   provider preparation -> Tsonic builds -> dotnet builds -> xUnit tests ->
#   Node e2e tests (CLI + fixtures + server) -> NativeAOT publish + smoke.
# Fails closed on the first broken stage. No optional stages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p "$ROOT/.temp/verification-runs"
VERIFY_ROOT="$(mktemp -d "$ROOT/.temp/verification-runs/run-XXXXXXXX")"
echo "Verification artifacts: $VERIFY_ROOT"

echo "=== prepare provider references ==="
bash scripts/prepare-provider-references.sh 2>&1 | tee "$VERIFY_ROOT/provider-references.log"

echo "=== parallel tsonic builds ==="
TSONIC_PHASE_TIMINGS=1 \
TSUMO_BUILD_LOG_DIR="$VERIFY_ROOT/tsonic" \
bash scripts/build-tsonic.sh

echo "=== parallel dotnet builds ==="
TSUMO_DOTNET_LOG_DIR="$VERIFY_ROOT/dotnet" bash scripts/build-dotnet.sh

echo "=== dotnet test ==="
TSUMO_TEST_ROOT="$VERIFY_ROOT/dotnet-test-runs" \
dotnet test packages/tests/Tsumo.Tests.csproj --no-build --no-restore \
  2>&1 | tee "$VERIFY_ROOT/dotnet-test.log"

echo "=== node e2e tests ==="
node --test "test/**/*.test.mjs" 2>&1 | tee "$VERIFY_ROOT/node-e2e.log"

echo "=== NativeAOT publish + smoke ==="
AOT_PUBLISH="$VERIFY_ROOT/aot-publish"
mkdir -p "$AOT_PUBLISH"
dotnet publish packages/cli/Tsumo.Cli.csproj -c Release --no-restore -o "$AOT_PUBLISH" \
  2>&1 | tee "$VERIFY_ROOT/aot-publish.log"
AOT_BIN="$AOT_PUBLISH/tsumo"
if [[ ! -x "$AOT_BIN" ]]; then
  echo "FAIL: NativeAOT publish produced no tsumo executable" >&2
  exit 1
fi
"$AOT_BIN" --help >/dev/null
NORMAL_OUT="$VERIFY_ROOT/normal-site"
AOT_OUT="$VERIFY_ROOT/aot-site"
SOURCE_DATE_EPOCH=1767225600 \
  "$ROOT/packages/cli/bin/Debug/net10.0/tsumo" build \
  --source "$ROOT/examples/basic-blog" --destination "$NORMAL_OUT"
SOURCE_DATE_EPOCH=1767225600 \
  "$AOT_BIN" build --source "$ROOT/examples/basic-blog" --destination "$AOT_OUT"
diff \
  <(cd "$NORMAL_OUT" && find . -type f -print0 | sort -z | xargs -0 sha256sum) \
  <(cd "$AOT_OUT" && find . -type f -print0 | sort -z | xargs -0 sha256sum) \
  | tee "$VERIFY_ROOT/aot-output-diff.log"
test "$(find "$AOT_OUT" -type f | wc -l)" -eq 21

echo "ALL VERIFICATIONS PASSED"
