#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build-release.sh — Build Sero desktop app for local distribution
#
# Usage:
#   bash scripts/build-release.sh --target current       # Build current OS artifacts
#   bash scripts/build-release.sh --target mac           # Build macOS DMG + ZIP on macOS
#   bash scripts/build-release.sh --target linux         # Build Linux artifacts on Linux
#   bash scripts/build-release.sh --target win           # Build Windows artifacts on Windows
#   bash scripts/build-release.sh --target mac --sign    # Build signed macOS artifacts
#   bash scripts/build-release.sh --target current --dir # Build unpacked app directory
#
# Output: apps/desktop/release/
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"

cleanup_packaging() {
  node "$PROJECT_DIR/scripts/cleanup-packaging.mjs" || true
}
trap cleanup_packaging EXIT

usage() {
  cat <<'EOF'
Usage: bash scripts/build-release.sh [--target current|mac|linux|win] [--sign] [--dir]

Builds Sero desktop release artifacts on a native OS runner. Cross-OS desktop
packaging is intentionally rejected because native modules are rebuilt for the
current OS before electron-builder runs.

Options:
  --target <target>  Target OS family. Defaults to current.
  --sign             Enable existing macOS signing flow (requires CSC_LINK).
  --dir              Build an unpacked app directory instead of distributables.
  -h, --help         Show this help.
EOF
}

host_target() {
  case "$(node -p 'process.platform')" in
    darwin) echo "mac" ;;
    linux) echo "linux" ;;
    win32) echo "win" ;;
    *) echo "unsupported" ;;
  esac
}

electron_builder_flag() {
  case "$1" in
    mac) echo "--mac" ;;
    linux) echo "--linux" ;;
    win) echo "--win" ;;
    *) echo "ERROR: Unsupported target: $1" >&2; exit 1 ;;
  esac
}

artifact_glob() {
  case "$1" in
    mac) echo "release/*.{dmg,zip}" ;;
    linux) echo "release/*.{AppImage,deb,tar.gz}" ;;
    win) echo "release/*.{exe,zip}" ;;
  esac
}

# ── Parse flags ──────────────────────────────────────────────
SIGN=false
DIR_BUILD=false
TARGET="current"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --sign)
      SIGN=true
      shift
      ;;
    --dir)
      DIR_BUILD=true
      shift
      ;;
    --target)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --target requires current, mac, linux, or win"
        exit 1
      fi
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $1"
      usage
      exit 1
      ;;
  esac
done

HOST_TARGET="$(host_target)"
if [ "$TARGET" = "current" ]; then
  TARGET="$HOST_TARGET"
fi

case "$TARGET" in
  mac|linux|win) ;;
  *)
    echo "ERROR: --target must be current, mac, linux, or win"
    exit 1
    ;;
esac

if [ "$HOST_TARGET" = "unsupported" ]; then
  echo "ERROR: Unsupported host platform: $(node -p 'process.platform')"
  exit 1
fi

if [ "$TARGET" != "$HOST_TARGET" ]; then
  echo "ERROR: Refusing to package target '$TARGET' on native host '$HOST_TARGET'."
  echo "       Sero release packaging must run on a matching OS runner because"
  echo "       node-pty and better-sqlite3 are rebuilt for Electron on the host OS."
  exit 1
fi

if [ "$SIGN" = true ] && [ "$TARGET" != "mac" ]; then
  echo "ERROR: --sign currently preserves the existing macOS signing flow only."
  exit 1
fi

BUILDER_FLAG="$(electron_builder_flag "$TARGET")"

# ── Preflight checks ────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║           Sero Release Build                 ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "▸ Target: ${TARGET} (native host: ${HOST_TARGET})"
if [ "$DIR_BUILD" = true ]; then
  echo "▸ Mode: unpacked app directory"
else
  echo "▸ Mode: distributable artifacts"
fi

if [ ! -f "package.json" ]; then
  echo "ERROR: Must run from apps/desktop/"
  exit 1
fi

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
if [ -z "$ELECTRON_VERSION" ]; then
  echo "ERROR: Failed to read installed Electron version"
  exit 1
fi
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
BUILDER_ARGS=(--config electron-builder.yml "$BUILDER_FLAG")
if [ "$DIR_BUILD" = true ]; then
  BUILDER_ARGS+=(--dir)
fi

if [ "$SIGN" = true ]; then
  # Signed build — requires CSC_LINK and CSC_KEY_PASSWORD env vars
  if [ -z "${CSC_LINK:-}" ]; then
    echo "ERROR: --sign requires CSC_LINK env var (path to .p12 certificate)"
    exit 1
  fi
  npx electron-builder "${BUILDER_ARGS[@]}"
else
  # Unsigned build — skip code signing entirely
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder "${BUILDER_ARGS[@]}"
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  Build complete! Output in: apps/desktop/release/"
echo ""
ARTIFACTS="$(artifact_glob "$TARGET")"
# shellcheck disable=SC2086
ls -lh $ARTIFACTS 2>/dev/null || echo "  (no artifacts found — check logs above)"
echo "════════════════════════════════════════════════"
