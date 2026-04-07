#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TSONIC_BIN:-}" ]]; then
  echo "FAIL: TSONIC_BIN is not set. Set it to the tsonic CLI path." >&2
  exit 1
fi

source "${ROOT}/scripts/local-first-party.sh"

overlay_local_first_party_packages "${ROOT}"

echo "=== build ==="
(cd "${ROOT}" && npm run build)

echo "=== typecheck ==="
(cd "${ROOT}" && npm run typecheck)

echo "=== test ==="
(cd "${ROOT}" && npm test)

echo "=== selftest ==="
(cd "${ROOT}" && bash ./scripts/selftest.sh)

echo ""
echo "=== ALL VERIFY-ALL CHECKS PASSED ==="
