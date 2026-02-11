#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Building tsumo (engine + cli) ==="
cd "$ROOT"
npm run build

TSUMO_BIN="$ROOT/packages/cli/out/tsumo"
if [[ ! -x "$TSUMO_BIN" ]]; then
  echo "FAIL: missing executable: $TSUMO_BIN"
  exit 1
fi

TMP="$ROOT/.tmp/selftest"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "=== Selftest: basic-blog ==="
"$TSUMO_BIN" build --source "$ROOT/examples/basic-blog" --destination "$TMP/basic-blog"

test -f "$TMP/basic-blog/index.html"
test -f "$TMP/basic-blog/posts/hello-world/index.html"
grep -q "Hello World" "$TMP/basic-blog/posts/hello-world/index.html"

echo "PASS: basic-blog"

echo "=== Selftest: docs-site (optional) ==="
DOCS_MOUNT_TSONIC="$ROOT/examples/docs-site/../../../tsonic/docs"
DOCS_MOUNT_TSBINDGEN="$ROOT/examples/docs-site/../../../tsbindgen/docs"

if [[ -d "$DOCS_MOUNT_TSONIC" && -d "$DOCS_MOUNT_TSBINDGEN" ]]; then
  "$TSUMO_BIN" build --source "$ROOT/examples/docs-site" --destination "$TMP/docs-site"

  test -f "$TMP/docs-site/index.html"
  test -f "$TMP/docs-site/search.json"
  test -d "$TMP/docs-site/tsonic"
  test -d "$TMP/docs-site/tsbindgen"

  echo "PASS: docs-site"
else
  echo "SKIP: docs-site (mount sources not found)"
fi

echo ""
echo "=== ALL SELFTESTS PASSED ==="

