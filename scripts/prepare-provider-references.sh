#!/usr/bin/env bash
# Materializes the exact provider reference assemblies used for Tsonic source
# checking and target compilation into one immutable snapshot:
#   1. the deterministic vendored Markdig build;
#   2. the engine project's locked managed NuGet compile closure
#      (PhotoSauce.MagicScaler, BouncyCastle.Cryptography).
# The same files are referenced by the user-owned .csproj files, so one
# assembly is one contract.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
SNAPSHOT_ROOT="$REPO_ROOT/.temp/provider-reference-snapshots/$RUN_ID"
PROVIDER_DIR="$SNAPSHOT_ROOT/product"
TEST_PROVIDER_DIR="$SNAPSHOT_ROOT/tests"
MARKDIG_BUILD_DIR="$SNAPSHOT_ROOT/markdig-build"
ACTIVE_LINK="$REPO_ROOT/.temp/active-provider-references"
NEXT_LINK="$REPO_ROOT/.temp/.active-provider-references-$RUN_ID"

mkdir -p "$PROVIDER_DIR" "$TEST_PROVIDER_DIR" "$MARKDIG_BUILD_DIR"

dotnet build "$REPO_ROOT/packages/markdig/vendor-src/Markdig.Vendored.csproj" -c Release -o "$MARKDIG_BUILD_DIR" --verbosity quiet
cp "$MARKDIG_BUILD_DIR/Markdig.dll" "$PROVIDER_DIR/Markdig.dll"

dotnet restore "$REPO_ROOT/packages/engine/Tsumo.Engine.csproj" --locked-mode --verbosity quiet
dotnet restore "$REPO_ROOT/packages/cli/Tsumo.Cli.csproj" --locked-mode --verbosity quiet
dotnet msbuild "$REPO_ROOT/packages/engine/Tsumo.Engine.csproj" \
  -target:PrepareTsonicProviderReferences \
  -property:TsumoProviderReferenceDirectory="$PROVIDER_DIR" \
  -verbosity:quiet \
  -nologo

dotnet restore "$REPO_ROOT/packages/tests/Tsumo.Tests.csproj" --locked-mode --verbosity quiet
dotnet msbuild "$REPO_ROOT/packages/tests/Tsumo.Tests.csproj" \
  -target:PrepareTsonicTestProviderReferences \
  -property:TsumoProviderReferenceDirectory="$PROVIDER_DIR" \
  -property:TsumoTestProviderReferenceDirectory="$TEST_PROVIDER_DIR" \
  -verbosity:quiet \
  -nologo

test -f "$PROVIDER_DIR/Markdig.dll"
compgen -G "$PROVIDER_DIR/*.dll" >/dev/null
compgen -G "$TEST_PROVIDER_DIR/*.dll" >/dev/null

ln -s "provider-reference-snapshots/$RUN_ID" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$ACTIVE_LINK"

echo "active provider snapshot: $SNAPSHOT_ROOT"
echo "product provider references:"
ls -1 "$PROVIDER_DIR"
echo "test provider references:"
ls -1 "$TEST_PROVIDER_DIR"
