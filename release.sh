#!/usr/bin/env bash
# release.sh: produce a clean zip + Steam Workshop manifest ready for upload.
#
# Usage:  ./release.sh
# Output: dist/partisans-vX.Y.Z.zip      (X.Y.Z from partisans.modinfo <Version>)
#         dist/partisans/                (the content folder steamcmd uploads)
#         dist/workshop_item.vdf         (steamcmd build manifest)
#
# Runs the verify gate, copies the mod into dist/ without the dev files (tests, scripts, docs, devtools, node_modules,
# tooling configs), syntax-checks and zips it, audits the zip against an allow-list, and writes the Workshop .vdf.
# The JS ships readable, not minified. Run from the mod source directory.

set -euo pipefail
cd "$(dirname "$0")"

MOD="partisans"
MODINFO="$MOD.modinfo"

# never package a red build. SKIP_VERIFY=1 bypasses the gate (emergency only).
if [ "${SKIP_VERIFY:-0}" != "1" ]; then
  echo "release: running 'npm run verify' (set SKIP_VERIFY=1 to skip)..."
  npm run verify || { echo "release: 'npm run verify' FAILED - aborting."; exit 1; }
fi

[ -f "$MODINFO" ] || { echo "error: $MODINFO not found in $(pwd)"; exit 1; }

VERSION="$(grep -oE '<Version>[^<]+</Version>' "$MODINFO" | head -1 | sed -E 's|</?Version>||g')"
[ -n "$VERSION" ] || { echo "error: could not parse <Version> from modinfo"; exit 1; }

AUTHORS="$(grep -oE '<Authors>[^<]+</Authors>' "$MODINFO" | head -1 | sed -E 's|</?Authors>||g')"
case "$AUTHORS" in
    ""|"Your Name"|"TODO") echo "error: set a real <Authors> in the modinfo first (got '$AUTHORS')."; exit 1 ;;
esac

# Steam Workshop published file id: steamcmd updates the existing item instead of creating a duplicate. It lives
# outside dist/ (which is wiped below) in steam_workshop_id.txt.
WORKSHOP_ID_FILE="steam_workshop_id.txt"
PUBLISHED_FILE_ID="${WORKSHOP_PUBLISHED_FILE_ID:-}"
SAVED_ID=""
[ -f "$WORKSHOP_ID_FILE" ] && SAVED_ID="$(tr -dc '0-9' < "$WORKSHOP_ID_FILE")"
if [ -z "$PUBLISHED_FILE_ID" ] && [ -n "$SAVED_ID" ]; then PUBLISHED_FILE_ID="$SAVED_ID"; fi

DIST_DIR="dist"
TARGET_DIR="$DIST_DIR/$MOD"
ZIP_NAME="$MOD-v$VERSION.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

echo "==> Cleaning $DIST_DIR/"
rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR"

echo "==> Mirroring ./ -> $TARGET_DIR/ (excluding dev files)"
rsync -a \
    --exclude='.git' --exclude='.gitignore' --exclude='.DS_Store' --exclude='dist' \
    --exclude='release.sh' --exclude='*.bak' --exclude='node_modules' \
    --exclude='docs' --exclude='eslint.config.js' --exclude='package.json' --exclude='package-lock.json' \
    --exclude='tests' --exclude='steam_workshop_id.txt' --exclude='scripts' --exclude='devtools' \
    --exclude='coverage*' --exclude='reports' --exclude='*.log' --exclude='/text/README.md' \
    ./ "$TARGET_DIR"/

echo "==> Syntax-checking shipped JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 -n1 node -c

echo "==> Verifying modinfo at content root"
[ -f "$TARGET_DIR/$MODINFO" ] || { echo "error: $TARGET_DIR/$MODINFO missing"; exit 1; }

echo "==> Zipping $ZIP_PATH"
( cd "$DIST_DIR" && zip -qr "$ZIP_NAME" "$MOD" )

echo "==> Verifying zip contents against allow-list"
ALLOW="^$MOD/($MOD\\.modinfo|README\\.md|LICENSE|CHANGELOG\\.md)\$"
ALLOW="$ALLOW"'|^'"$MOD"'/ui/.+\.js$'
ALLOW="$ALLOW"'|^'"$MOD"'/text/[a-z_]+/(ModText|PediaText)\.xml$'
ALLOW="$ALLOW"'|^'"$MOD"'/data/.+\.(xml|sql)$'
UNEXPECTED="$(unzip -Z1 "$ZIP_PATH" | grep -vE '/$' | grep -vE "$ALLOW" || true)"
if [ -n "$UNEXPECTED" ]; then
    echo "error: zip contains entries not on the allow-list:"
    echo "$UNEXPECTED" | sed 's/^/    /'
    exit 1
fi
echo "    OK: every shipped entry matches the allow-list."

SIZE="$(du -h "$ZIP_PATH" | cut -f1)"

# Steam Workshop manifest (.vdf). No "description": steamcmd keeps the Workshop page's text. No preview file:
# the upload is made with the no-preview manifest (previewfile uploads are refused for this account).
VDF_PATH="$DIST_DIR/workshop_item.vdf"
ABS_CONTENT="$(cd "$TARGET_DIR" && pwd)"
CHANGENOTE="$VERSION: first release."
if [ -n "$PUBLISHED_FILE_ID" ]; then
    CHANGENOTE="$(awk -v v="$VERSION" '
        $0 ~ "^## \\[" v "\\]" { on = 1; next }
        on && /^## \[/ { exit }
        on { print }' CHANGELOG.md | sed -E 's/^- //; s/"//g; s/\\//g' | grep -v '^$' | head -8 | tr '\n' ' ')"
    [ -n "$CHANGENOTE" ] || { echo "error: no CHANGELOG.md entry for $VERSION"; exit 1; }
fi

{
    echo '"workshopitem"'
    echo '{'
    echo '    "appid"          "1295660"'
    [ -n "$PUBLISHED_FILE_ID" ] && echo "    \"publishedfileid\" \"$PUBLISHED_FILE_ID\""
    echo "    \"contentfolder\"  \"$ABS_CONTENT\""
    echo '    "visibility"     "0"'
    echo '    "title"          "Partisans"'
    echo "    \"changenote\"     \"${CHANGENOTE}\""
    echo '}'
} > "$VDF_PATH"

echo "==> Workshop manifest written: $VDF_PATH"
echo ""
echo "Release built:  $ZIP_PATH  ($SIZE)"
echo "  Version:      $VERSION"
echo "  Authors:      $AUTHORS"
if [ -n "$PUBLISHED_FILE_ID" ]; then
    echo "  UPDATE mode:  publishedfileid $PUBLISHED_FILE_ID (existing item)"
else
    echo "  NEW-ITEM mode: no publishedfileid yet. The first upload creates one;"
    echo "                 then run: echo <publishedfileid> > steam_workshop_id.txt"
fi
echo ""
echo "-- Upload (from Mac, needs steamcmd) --"
echo "  ~/steamcmd/steamcmd.sh +login <yourSteamLogin> \\"
echo "      +workshop_build_item $(cd "$DIST_DIR" && pwd)/workshop_item.vdf +quit"
