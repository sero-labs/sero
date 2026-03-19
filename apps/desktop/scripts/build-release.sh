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

# ── Step 1: Install dependencies ─────────────────────────────
echo "▸ Step 1/7: Installing dependencies..."
cd "$MONO_ROOT"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
cd "$PROJECT_DIR"

# ── Step 2: Typecheck ────────────────────────────────────────
echo "▸ Step 2/7: Running typecheck..."
cd "$MONO_ROOT"
pnpm typecheck
cd "$PROJECT_DIR"

# ── Step 3: Build all packages (turbo) ───────────────────────
echo "▸ Step 3/7: Building all packages..."
cd "$MONO_ROOT"
pnpm build
cd "$PROJECT_DIR"

# ── Step 4: Build web-remote SPA (if it exists) ─────────────
WEB_REMOTE_DIR="$MONO_ROOT/apps/web-remote"
if [ -d "$WEB_REMOTE_DIR" ]; then
  echo "▸ Step 4/7: Building web-remote SPA..."
  cd "$WEB_REMOTE_DIR"
  pnpm build 2>/dev/null || npm run build
  cd "$PROJECT_DIR"

  # Copy web-remote dist into electron output (not a symlink for release)
  WEB_DIST_SRC="$PROJECT_DIR/electron/gateway/web-dist"
  WEB_DIST_DEST="$PROJECT_DIR/dist/electron/web-dist"
  if [ -d "$WEB_DIST_SRC" ]; then
    rm -rf "$WEB_DIST_DEST"
    cp -R "$WEB_DIST_SRC" "$WEB_DIST_DEST"
    echo "  Copied web-dist/ into dist/electron/ (release copy, not symlink)"
  fi
else
  echo "▸ Step 4/7: Skipping web-remote (not found)"
fi

# ── Step 5: Rebuild native modules for Electron ─────────────
# electron-builder's npmRebuild is disabled (pnpm workspace symlinks break it),
# so we rebuild node-pty and better-sqlite3 manually against Electron's Node ABI.
echo "▸ Step 5/7: Rebuilding native modules for Electron..."
if npx @electron/rebuild -f -w node-pty,better-sqlite3; then
  echo "  Rebuilt node-pty + better-sqlite3 for Electron's Node ABI"
else
  echo ""
  echo "  ⚠ @electron/rebuild failed — native modules may use host Node ABI"
  echo "  Ensure @electron/rebuild is installed: pnpm add -D @electron/rebuild"
  echo "  (terminals and database will fail in packaged build without correct ABI)"
  exit 1
fi

# ── Step 6: VMP signing (Widevine) ───────────────────────────
echo "▸ Step 6/7: VMP signing..."
if command -v evs-vmp > /dev/null 2>&1; then
  if [ -f scripts/sign-vmp.sh ]; then
    bash scripts/sign-vmp.sh
  else
    echo "  ⚠ scripts/sign-vmp.sh not found — skipping VMP signing"
  fi
else
  echo "  ⚠ castlabs-evs not installed — skipping VMP signing"
  echo "  Install with: pipx install castlabs-evs"
  echo "  (DRM playback will not work without VMP signature)"
fi

# ── Step 7: Package with electron-builder ────────────────────
echo "▸ Step 7/7: Packaging with electron-builder..."

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
