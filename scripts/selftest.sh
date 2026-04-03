#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_PARENT="$(cd "${ROOT}/.." && pwd)"
LOCAL_CORE_PACKAGE="${WORKSPACE_PARENT}/core/versions/10"
LOCAL_DOTNET_PACKAGE="${WORKSPACE_PARENT}/dotnet/versions/10"
LOCAL_JS_PACKAGE="${WORKSPACE_PARENT}/js/versions/10"
LOCAL_NODEJS_PACKAGE="${WORKSPACE_PARENT}/nodejs/versions/10"

if [[ -z "${TSONIC_BIN:-}" ]]; then
  echo "FAIL: TSONIC_BIN is not set. Set it to the tsonic CLI path." >&2
  exit 1
fi

link_local_package() {
  local package_name="$1"
  local package_root="$2"
  local scope_dir="${ROOT}/node_modules/@tsonic"
  local destination="${scope_dir}/${package_name}"

  if [[ ! -d "${scope_dir}" ]]; then
    echo "FAIL: expected scope directory missing: ${scope_dir}" >&2
    exit 1
  fi

  if [[ ! -e "${package_root}" ]]; then
    echo "FAIL: local package root missing: ${package_root}" >&2
    exit 1
  fi

  rm -rf "${destination}"
  ln -s "${package_root}" "${destination}"
}

overlay_local_first_party_packages() {
  echo "=== overlay local first-party packages ==="
  link_local_package core "${LOCAL_CORE_PACKAGE}"
  link_local_package dotnet "${LOCAL_DOTNET_PACKAGE}"
  link_local_package js "${LOCAL_JS_PACKAGE}"
  link_local_package nodejs "${LOCAL_NODEJS_PACKAGE}"
}

overlay_local_first_party_packages

echo "=== Building tsumo (engine + cli) ==="
(cd "$ROOT/packages/engine" && "$TSONIC_BIN" restore && "$TSONIC_BIN" build)
(cd "$ROOT/packages/cli" && "$TSONIC_BIN" build)

TSUMO_BIN="$ROOT/packages/cli/out/tsumo"
if [[ ! -x "$TSUMO_BIN" ]]; then
  echo "FAIL: missing executable: $TSUMO_BIN"
  exit 1
fi

mkdir -p "$ROOT/.temp"
TMP="$(mktemp -d "$ROOT/.temp/selftest.XXXXXX")"

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
