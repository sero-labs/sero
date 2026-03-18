#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# generate-icon.sh — Generate a placeholder app icon for Sero
#
# Creates build/icon.icns (macOS), build/icon.png (generic)
# from a 1024x1024 source PNG.
#
# Usage:
#   bash scripts/generate-icon.sh                    # Generate from placeholder
#   bash scripts/generate-icon.sh path/to/icon.png   # Generate from custom PNG
#
# Requires: sips + iconutil (built into macOS)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"

mkdir -p "$BUILD_DIR"

SOURCE="${1:-}"

if [ -z "$SOURCE" ]; then
  echo "No source icon provided."
  echo ""
  echo "To generate icons, provide a 1024x1024 PNG:"
  echo "  bash scripts/generate-icon.sh path/to/icon.png"
  echo ""
  echo "The script will create:"
  echo "  build/icon.icns  (macOS app icon)"
  echo "  build/icon.png   (1024x1024 copy)"
  exit 0
fi

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Source file not found: $SOURCE"
  exit 1
fi

echo "Generating icons from: $SOURCE"

# Copy source as the 1024x1024 PNG
cp "$SOURCE" "$BUILD_DIR/icon.png"

# Generate .icns via iconutil (macOS only)
if command -v iconutil &> /dev/null && command -v sips &> /dev/null; then
  ICONSET="$BUILD_DIR/icon.iconset"
  mkdir -p "$ICONSET"

  # Generate all required sizes
  for SIZE in 16 32 64 128 256 512; do
    sips -z $SIZE $SIZE "$SOURCE" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" > /dev/null
    DOUBLE=$((SIZE * 2))
    sips -z $DOUBLE $DOUBLE "$SOURCE" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" > /dev/null
  done

  iconutil -c icns "$ICONSET" -o "$BUILD_DIR/icon.icns"
  rm -rf "$ICONSET"
  echo "Created: build/icon.icns"
else
  echo "⚠ iconutil/sips not available (not macOS?) — skipping .icns generation"
  echo "  electron-builder will fall back to build/icon.png"
fi

echo "Created: build/icon.png"
echo "Done!"
