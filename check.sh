#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$script_dir"

package_name="${1:-check-$(date +'%Y%m%d%H%M%S')}"
package_name="${package_name%.zip}"
package_path="${package_name}.zip"

gjs -m tests/*
node --check src/*
glib-compile-schemas --strict schemas/
git diff --check

bash package.sh "$package_name"
python3 -m venv venv
. venv/bin/activate
python -m pip install -U shexli
shexli "$package_path"

rm "$package_path"
