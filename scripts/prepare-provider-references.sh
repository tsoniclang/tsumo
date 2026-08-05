#!/usr/bin/env bash
# Materializes the exact provider reference assemblies used for Tsonic source
# checking AND target compilation into .temp/provider-references:
#   1. the deterministic vendored Markdig build;
#   2. the engine project's locked managed NuGet compile closure
#      (PhotoSauce.MagicScaler, BouncyCastle.Cryptography).
# The same files are referenced by the user-owned .csproj files, so one
# assembly is one contract.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROVIDER_DIR="$REPO_ROOT/.temp/provider-references"
MARKDIG_BUILD_DIR="$REPO_ROOT/.temp/markdig-build"

rm -rf "$PROVIDER_DIR"
mkdir -p "$PROVIDER_DIR"

dotnet build "$REPO_ROOT/packages/markdig/vendor-src/Markdig.Vendored.csproj" -c Release -o "$MARKDIG_BUILD_DIR" --verbosity quiet
cp "$MARKDIG_BUILD_DIR/Markdig.dll" "$PROVIDER_DIR/Markdig.dll"

if [[ -f "$REPO_ROOT/packages/engine/packages.lock.json" ]]; then
  dotnet restore "$REPO_ROOT/packages/engine/Tsumo.Engine.csproj" --locked-mode --verbosity quiet
else
  dotnet restore "$REPO_ROOT/packages/engine/Tsumo.Engine.csproj" --verbosity quiet
fi
dotnet msbuild "$REPO_ROOT/packages/engine/Tsumo.Engine.csproj" -target:PrepareTsonicProviderReferences -property:RestoreLockedMode=true -verbosity:quiet -nologo

echo "prepared provider references:"
ls -1 "$PROVIDER_DIR"
