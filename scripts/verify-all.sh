#!/usr/bin/env bash
# Full verification gate for a fresh checkout:
#   provider preparation -> Tsonic builds -> dotnet builds -> xUnit tests ->
#   Node e2e tests (CLI + fixtures + server) -> NativeAOT publish + smoke.
# Fails closed on the first broken stage. No optional stages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== prepare provider references ==="
bash scripts/prepare-provider-references.sh

echo "=== tsonic build: engine ==="
(cd packages/engine && node "$ROOT/node_modules/@tsonic/cli/dist/src/index.js" build --project tsonic.json)

echo "=== tsonic build: cli ==="
(cd packages/cli && node "$ROOT/node_modules/@tsonic/cli/dist/src/index.js" build --project tsonic.json)

echo "=== tsonic build: tests ==="
(cd packages/tests && node "$ROOT/node_modules/@tsonic/cli/dist/src/index.js" build --project tsonic.json)

echo "=== dotnet build ==="
dotnet build packages/engine/Tsumo.Engine.csproj
dotnet build packages/cli/Tsumo.Cli.csproj
dotnet build packages/tests/Tsumo.Tests.csproj

echo "=== dotnet test ==="
dotnet test packages/tests/Tsumo.Tests.csproj --no-build

echo "=== node e2e tests ==="
node --test "test/"

echo "=== NativeAOT publish + smoke ==="
dotnet publish packages/cli/Tsumo.Cli.csproj -c Release
AOT_BIN="$(find packages/cli/bin/Release -type f -name tsumo -path "*/publish/*" | head -1)"
if [[ -z "$AOT_BIN" ]]; then
  echo "FAIL: NativeAOT publish produced no tsumo executable" >&2
  exit 1
fi
"$AOT_BIN" --help >/dev/null
AOT_OUT="$ROOT/.temp/verify-aot-site"
rm -rf "$AOT_OUT"
"$AOT_BIN" build --source "$ROOT/examples/basic-blog" --destination "$AOT_OUT"
test -f "$AOT_OUT/index.html"

echo "ALL VERIFICATIONS PASSED"
