#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

include_files=(
  src
  stylesheet.css
  extension.js
  metadata.json
  prefs.js
  LICENSE
  schemas
  icons
)

existing_files=()
for include_file in "${include_files[@]}"; do
  if [ -e "$include_file" ]; then
    existing_files+=("$include_file")
  fi
done

if [[ -n ${1:-} ]]; then
  package_name=$1
else
  package_name=$(date +'%Y%m%d%H%M%S')
fi
package_name="${package_name%.zip}"

zip -r "${package_name}.zip" "${existing_files[@]}" -x 'schemas/gschemas.compiled'
