#!/usr/bin/env bash
#
# Build a Sero plugin package for distribution.
#
# Usage:
#   bash scripts/build-plugin.sh packages/pi-todo-extension
#   bash scripts/build-plugin.sh packages/pi-spotify-extension
#
# Produces a ready-to-publish package in <package>/dist/ with:
#   - dist/ui/         Pre-built MF remote (remoteEntry.js, chunks, manifest)
#   - extension/       Compiled Pi extension (JS)
#   - shared/          Compiled shared types (JS)
#   - package.json     Cleaned manifest (no devDependencies)
#
# Prerequisites: pnpm install from monorepo root.

set -euo pipefail

PACKAGE_DIR="${1:?Usage: build-plugin.sh <package-dir>}"

if [ ! -f "$PACKAGE_DIR/package.json" ]; then
  echo "❌ No package.json found in $PACKAGE_DIR"
  exit 1
fi

# Verify sero.app manifest exists
APP_ID=$(node -e "
  const pkg = require('./$PACKAGE_DIR/package.json');
  if (!pkg.sero?.app?.id) { process.exit(1); }
  console.log(pkg.sero.app.id);
" 2>/dev/null) || {
  echo "❌ No sero.app.id found in $PACKAGE_DIR/package.json"
  exit 1
}

echo "📦 Building plugin: $APP_ID ($PACKAGE_DIR)"

# 1. Build the MF UI remote
echo "  → Building UI remote..."
cd "$PACKAGE_DIR"
NODE_ENV=production npx vite build
cd - > /dev/null

echo "✅ Plugin $APP_ID built successfully"
echo "   Output: $PACKAGE_DIR/dist/ui/"
echo ""
echo "To test locally:"
echo "   cp -r $PACKAGE_DIR ~/.sero-ui/agent/packages/$APP_ID"
