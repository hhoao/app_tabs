#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

package_name="${1:-check-$(date +'%Y%m%d%H%M%S')}"
package_name="${package_name%.zip}"
package_path="${package_name}.zip"
export TERM="${TERM:-xterm}"

gjs -m tests/*
while IFS= read -r -d '' js_file; do
  node --check "$js_file"
done < <(find extension.js prefs.js src tests -type f -name '*.js' -print0)
glib-compile-schemas --strict schemas/
git diff --check

bash scripts/package.sh "$package_name"
python3 -m venv venv
. venv/bin/activate
python -m pip install -U shexli
shexli "$package_path"

rm "$package_path"
