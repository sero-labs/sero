#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build-release.sh — Build Sero desktop app for local distribution
#
# Usage:
#   bash scripts/build-release.sh          # Build unsigned DMG + ZIP
#   bash scripts/build-release.sh --sign   # Build with code signing
#
# Output: apps/desktop/release/
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"

# ── Parse flags ──────────────────────────────────────────────
SIGN=false
for arg in "$@"; do
  case "$arg" in
    --sign) SIGN=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Preflight checks ────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║           Sero Release Build                 ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check we're in the right directory
if [ ! -f "package.json" ]; then
  echo "ERROR: Must run from apps/desktop/"
  exit 1
fi

# Check pnpm is available
if ! command -v pnpm &> /dev/null; then
  echo "ERROR: pnpm is required. Install with: npm install -g pnpm"
  exit 1
fi

# Pin the runtime image for packaged release builds. Development builds omit
# this variable and use ghcr.io/sero-labs/sero-node:latest as the fallback.
if [ -z "${SERO_NODE_IMAGE_TAG:-}" ]; then
  SERO_NODE_IMAGE_TAG="$(node -p "require('./package.json').version")"
  export SERO_NODE_IMAGE_TAG
fi
echo "▸ Runtime image tag: ghcr.io/sero-labs/sero-node:${SERO_NODE_IMAGE_TAG}"

# ── Step 1: Install dependencies ─────────────────────────────
echo "▸ Step 1/6: Installing dependencies..."
cd "$MONO_ROOT"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
cd "$PROJECT_DIR"

# ── Step 2: Typecheck ────────────────────────────────────────
echo "▸ Step 2/6: Running typecheck..."
cd "$MONO_ROOT"
pnpm typecheck
cd "$PROJECT_DIR"

# ── Step 3: Build all packages (turbo) ───────────────────────
echo "▸ Step 3/6: Building all packages..."
cd "$MONO_ROOT"
pnpm build
cd "$PROJECT_DIR"

# ── Step 4: Build web-remote SPA (if it exists) ─────────────
WEB_REMOTE_DIR="$MONO_ROOT/apps/web-remote"
if [ -d "$WEB_REMOTE_DIR" ]; then
  echo "▸ Step 4/6: Building web-remote SPA..."
  cd "$WEB_REMOTE_DIR"
  pnpm build 2>/dev/null || npm run build
  cd "$PROJECT_DIR"

else
  echo "▸ Step 4/6: Skipping web-remote (not found)"
fi

# Replace the dev symlink with a real copy so electron-builder packages the SPA.
node scripts/prepare-packaging.mjs

# ── Step 5: Rebuild native modules for Electron ─────────────
# electron-builder's npmRebuild is disabled (pnpm workspace symlinks break it),
# so we rebuild node-pty and better-sqlite3 manually against Electron's Node ABI.
echo "▸ Step 5/6: Rebuilding native modules for Electron..."
ELECTRON_VERSION="$(ELECTRON_RUN_AS_NODE=1 pnpm --dir "$PROJECT_DIR" exec electron -e "process.stdout.write(process.versions.electron)")"
if pnpm --dir "$PROJECT_DIR" exec electron-rebuild -f --version "$ELECTRON_VERSION" --module-dir "$MONO_ROOT" -w node-pty,better-sqlite3; then
  echo "  Rebuilt node-pty + better-sqlite3 for Electron ${ELECTRON_VERSION}"
else
  echo ""
  echo "  ⚠ electron-rebuild failed — native modules may use host Node ABI"
  echo "  Ensure @electron/rebuild is installed in apps/desktop"
  echo "  (terminals and database will fail in packaged build without correct ABI)"
  exit 1
fi

# ── Step 6: Package with electron-builder ────────────────────
echo "▸ Step 6/6: Packaging with electron-builder..."

if [ "$SIGN" = true ]; then
  # Signed build — requires CSC_LINK and CSC_KEY_PASSWORD env vars
  if [ -z "${CSC_LINK:-}" ]; then
    echo "ERROR: --sign requires CSC_LINK env var (path to .p12 certificate)"
    exit 1
  fi
  npx electron-builder --config electron-builder.yml --mac
else
  # Unsigned build — skip code signing entirely
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.yml --mac
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  Build complete! Output in: apps/desktop/release/"
echo ""
ls -lh release/*.{dmg,zip} 2>/dev/null || echo "  (no artifacts found — check logs above)"
echo "════════════════════════════════════════════════"
