#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TSONIC_BIN:-}" ]]; then
  echo "FAIL: TSONIC_BIN is not set. Set it to the tsonic CLI path." >&2
  exit 1
fi

ensure_interop_dlls() {
  local jsruntime_release="${ROOT}/../js-runtime/artifacts/bin/Tsonic.JSRuntime/Release/net10.0/Tsonic.JSRuntime.dll"
  local jsruntime_debug="${ROOT}/../js-runtime/artifacts/bin/Tsonic.JSRuntime/Debug/net10.0/Tsonic.JSRuntime.dll"
  local nodejs_release="${ROOT}/../nodejs-clr/artifacts/bin/nodejs/Release/net10.0/nodejs.dll"
  local nodejs_debug="${ROOT}/../nodejs-clr/artifacts/bin/nodejs/Debug/net10.0/nodejs.dll"
  local jsruntime_src=""
  local nodejs_src=""

  pick_newest_existing() {
    local newest=""
    for candidate in "$@"; do
      [[ -f "${candidate}" ]] || continue
      if [[ -z "${newest}" || "${candidate}" -nt "${newest}" ]]; then
        newest="${candidate}"
      fi
    done
    printf '%s' "${newest}"
  }

  jsruntime_src="$(pick_newest_existing "${jsruntime_release}" "${jsruntime_debug}")"
  nodejs_src="$(pick_newest_existing "${nodejs_release}" "${nodejs_debug}")"

  mkdir -p "${ROOT}/libs"

  if [[ -n "${jsruntime_src}" ]]; then
    cp "${jsruntime_src}" "${ROOT}/libs/Tsonic.JSRuntime.dll"
  fi

  if [[ -n "${nodejs_src}" ]]; then
    cp "${nodejs_src}" "${ROOT}/libs/nodejs.dll"
  fi
}

ensure_interop_dlls

echo "=== Building tsumo (engine + cli) ==="
(cd "$ROOT/packages/engine" && "$TSONIC_BIN" restore && "$TSONIC_BIN" build)
(cd "$ROOT/packages/cli" && "$TSONIC_BIN" build)

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
