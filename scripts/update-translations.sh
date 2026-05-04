#!/usr/bin/env bash
# 从源码更新 locale/app_tabs.pot，合并各语言 .po，并编译为 .mo
# Update locale/app_tabs.pot from sources, merge .po files, compile .mo files.

set -euo pipefail

EXT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$EXT_ROOT"

DOMAIN="app_tabs"
POT="locale/${DOMAIN}.pot"
POTFILES="locale/POTFILES.in"

usage() {
    echo "用法: $0 [--pot-only]"
    echo "  在扩展根目录执行: ./scripts/update-translations.sh"
    echo "  默认: 运行 xgettext → 更新 ${POT}，对每个 locale/*/LC_MESSAGES/${DOMAIN}.po 执行 msgmerge 与 msgfmt"
    echo "  --pot-only: 只生成 ${POT}，不合并、不编译 .mo"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

for cmd in xgettext msgmerge msgfmt; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "错误: 未找到命令「${cmd}」，请安装 gettext 包。" >&2
        exit 1
    fi
done

if [[ ! -f "$POTFILES" ]]; then
    echo "错误: 缺少 ${POTFILES}" >&2
    exit 1
fi

echo "==> xgettext → ${POT}"
xgettext \
    --from-code=UTF-8 \
    --language=JavaScript \
    --keyword=_ \
    --copyright-holder="hhoao" \
    --package-name="${DOMAIN}" \
    --package-version="1" \
    --files-from="$POTFILES" \
    --output="$POT"

if [[ "${1:-}" == "--pot-only" ]]; then
    echo "已仅更新模板，跳过 msgmerge / msgfmt。"
    exit 0
fi

shopt -s nullglob
for po in locale/*/LC_MESSAGES/"${DOMAIN}.po"; do
    echo "==> msgmerge + msgfmt: ${po}"
    msgmerge --update --no-fuzzy-matching "$po" "$POT"
    msgfmt -c -v -o "${po%.po}.mo" "$po"
done
shopt -u nullglob

echo "完成。"
