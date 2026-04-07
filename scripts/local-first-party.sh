#!/usr/bin/env bash
set -euo pipefail

TSUMO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_PARENT="$(cd "${TSUMO_ROOT}/.." && pwd)"
LOCAL_CORE_PACKAGE="${WORKSPACE_PARENT}/core/versions/10"
LOCAL_GLOBALS_PACKAGE="${WORKSPACE_PARENT}/globals/versions/10"
LOCAL_DOTNET_PACKAGE="${WORKSPACE_PARENT}/dotnet/versions/10"
LOCAL_JS_SOURCE_PACKAGE="${WORKSPACE_PARENT}/js/versions/10"
LOCAL_NODEJS_SOURCE_PACKAGE="${WORKSPACE_PARENT}/nodejs/versions/10"

ensure_local_package_exists() {
  local package_root="$1"
  local label="$2"
  if [[ ! -e "${package_root}" ]]; then
    echo "FAIL: local ${label} package root missing: ${package_root}" >&2
    exit 1
  fi
}

link_local_package() {
  local install_root="$1"
  local package_name="$2"
  local package_root="$3"
  local scope_dir="${install_root}/node_modules/@tsonic"
  local destination="${scope_dir}/${package_name}"

  if [[ ! -d "${scope_dir}" ]]; then
    echo "FAIL: expected scope directory missing: ${scope_dir}" >&2
    exit 1
  fi

  ensure_local_package_exists "${package_root}" "@tsonic/${package_name}"

  rm -rf "${destination}"
  ln -s "${package_root}" "${destination}"
}

for_each_install_root() {
  local workspace_dir="$1"
  local callback="$2"

  "${callback}" "${workspace_dir}"

  if [[ ! -d "${workspace_dir}/packages" ]]; then
    return 0
  fi

  while IFS= read -r -d '' package_dir; do
    "${callback}" "${package_dir}"
  done < <(
    find "${workspace_dir}/packages" -mindepth 1 -maxdepth 1 -type d -print0
  )
}

overlay_local_first_party_packages_for_root() {
  local install_root="$1"

  if [[ ! -d "${install_root}/node_modules/@tsonic" ]]; then
    return 0
  fi

  echo "=== overlay local first-party packages: ${install_root} ==="
  link_local_package "${install_root}" core "${LOCAL_CORE_PACKAGE}"
  link_local_package "${install_root}" globals "${LOCAL_GLOBALS_PACKAGE}"
  link_local_package "${install_root}" dotnet "${LOCAL_DOTNET_PACKAGE}"
  link_local_package "${install_root}" js "${LOCAL_JS_SOURCE_PACKAGE}"
  link_local_package "${install_root}" nodejs "${LOCAL_NODEJS_SOURCE_PACKAGE}"
}

overlay_local_first_party_packages() {
  local workspace_dir="${1:-${TSUMO_ROOT}}"
  for_each_install_root "${workspace_dir}" overlay_local_first_party_packages_for_root
}
