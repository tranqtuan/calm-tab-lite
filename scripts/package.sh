#!/bin/sh
# Builds a Chrome Web Store upload: only the files the extension loads at runtime.
# Leaves out dev/ (test harness), scripts/, README and PRIVACY (host PRIVACY.md on a web page).
#   sh scripts/package.sh   ->  dist/calm-tab-<version>.zip
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
mkdir -p dist
OUT="dist/calm-tab-lite-$VERSION.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json newtab.html offscreen.html blocked.html src styles fonts icons data -x '*.DS_Store'
echo "$OUT ($(du -h "$OUT" | cut -f1))"
