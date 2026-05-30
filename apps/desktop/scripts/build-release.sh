#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build-release.sh — Build Sero desktop app for local distribution
#
# Usage:
#   bash scripts/build-release.sh --target current       # Build current OS artifacts
#   bash scripts/build-release.sh --target mac           # Build macOS DMG + ZIP on macOS
#   bash scripts/build-release.sh --target linux         # Build Linux artifacts on Linux
#   bash scripts/build-release.sh --target linux --arch x64   # Build Linux x64 artifacts on Linux x64
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

# Self-contained production bundle produced by `pnpm deploy` and handed to
# electron-builder. Kept out of the git tree (see .gitignore).
DEPLOY_DIR="$PROJECT_DIR/.package-deploy"

cleanup_packaging() {
  node "$PROJECT_DIR/scripts/cleanup-packaging.mjs" || true
  rm -rf "$DEPLOY_DIR"
}
trap cleanup_packaging EXIT

usage() {
  cat <<'EOF'
Usage: bash scripts/build-release.sh [--target current|mac|linux|win] [--arch current|x64|arm64] [--sign] [--dir]

Builds Sero desktop release artifacts on a native OS runner. Cross-OS desktop
packaging is intentionally rejected because native modules are rebuilt for the
current OS before electron-builder runs. When --arch is set, it must match the
host architecture for the same native-module reason.

Options:
  --target <target>  Target OS family. Defaults to current.
  --arch <arch>      Target CPU architecture. Defaults to current when omitted.
  --sign             Force macOS Developer ID signing (requires CSC_LINK). Mac
                     builds also sign automatically whenever CSC_LINK is set, and
                     notarize when APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and
                     APPLE_TEAM_ID are also present.
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

host_arch() {
  case "$(node -p 'process.arch')" in
    x64) echo "x64" ;;
    arm64) echo "arm64" ;;
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

electron_builder_arch_flag() {
  case "$1" in
    x64) echo "--x64" ;;
    arm64) echo "--arm64" ;;
    *) echo "ERROR: Unsupported architecture: $1" >&2; exit 1 ;;
  esac
}

artifact_patterns() {
  case "$1" in
    mac) echo "release/*.dmg release/*.zip" ;;
    linux) echo "release/*.deb" ;;
    win) echo "release/*.exe release/*.zip" ;;
  esac
}

# ── Parse flags ──────────────────────────────────────────────
SIGN=false
DIR_BUILD=false
TARGET="current"
TARGET_ARCH="current"
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
    --arch)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --arch requires current, x64, or arm64"
        exit 1
      fi
      TARGET_ARCH="$2"
      shift 2
      ;;
    --arch=*)
      TARGET_ARCH="${1#--arch=}"
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
HOST_ARCH="$(host_arch)"
if [ "$TARGET" = "current" ]; then
  TARGET="$HOST_TARGET"
fi
if [ "$TARGET_ARCH" = "current" ]; then
  TARGET_ARCH="$HOST_ARCH"
fi

case "$TARGET" in
  mac|linux|win) ;;
  *)
    echo "ERROR: --target must be current, mac, linux, or win"
    exit 1
    ;;
esac

case "$TARGET_ARCH" in
  x64|arm64) ;;
  *)
    echo "ERROR: --arch must be current, x64, or arm64"
    exit 1
    ;;
esac

if [ "$HOST_TARGET" = "unsupported" ]; then
  echo "ERROR: Unsupported host platform: $(node -p 'process.platform')"
  exit 1
fi
if [ "$HOST_ARCH" = "unsupported" ]; then
  echo "ERROR: Unsupported host architecture: $(node -p 'process.arch')"
  exit 1
fi

if [ "$TARGET" != "$HOST_TARGET" ]; then
  echo "ERROR: Refusing to package target '$TARGET' on native host '$HOST_TARGET'."
  echo "       Sero release packaging must run on a matching OS runner because"
  echo "       node-pty and better-sqlite3 are rebuilt for Electron on the host OS."
  exit 1
fi

if [ "$TARGET_ARCH" != "$HOST_ARCH" ]; then
  echo "ERROR: Refusing to package architecture '$TARGET_ARCH' on native host architecture '$HOST_ARCH'."
  echo "       Native modules are rebuilt for the current host architecture before electron-builder runs."
  exit 1
fi

# Auto-enable macOS Developer ID signing when a certificate is provided via env
# (CI release with secrets configured, or a local signed test). Without CSC_LINK,
# mac builds stay unsigned and are ad-hoc sealed by scripts/after-pack.mjs.
if [ "$TARGET" = "mac" ] && [ -n "${CSC_LINK:-}" ]; then
  SIGN=true
fi

if [ "$SIGN" = true ] && [ "$TARGET" != "mac" ]; then
  echo "ERROR: --sign currently preserves the existing macOS signing flow only."
  exit 1
fi

BUILDER_FLAG="$(electron_builder_flag "$TARGET")"
BUILDER_ARCH_FLAG="$(electron_builder_arch_flag "$TARGET_ARCH")"

# ── Preflight checks ────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║           Sero Release Build                 ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "▸ Target: ${TARGET}/${TARGET_ARCH} (native host: ${HOST_TARGET}/${HOST_ARCH})"
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

# ── Step 3: Build desktop + bundled app packages ────────────
echo "▸ Step 3/6: Building bundled app packages..."
cd "$MONO_ROOT"
pnpm --filter "./packages/*" --filter "./plugins/*" --if-present build
pnpm --filter @sero/desktop build
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

# ── Step 5: Create a self-contained deploy bundle ───────────
# pnpm's isolated node_modules layout makes electron-builder's dependency
# collector silently drop transitive deps of externalized packages (e.g. the
# pi SDK's @mariozechner/pi-ai → partial-json/openai/@anthropic-ai/sdk), which
# crashes the packaged app at startup. `pnpm deploy` with a hoisted linker emits
# a flat, fully-resolved *production* node_modules that electron-builder packages
# reliably — so we no longer hand-maintain a node_modules allowlist.
echo "▸ Step 5/6: Creating deploy bundle + rebuilding native modules..."
ELECTRON_VERSION="$(ELECTRON_RUN_AS_NODE=1 pnpm --dir "$PROJECT_DIR" exec electron -e "process.stdout.write(process.versions.electron)")"
if [ -z "$ELECTRON_VERSION" ]; then
  echo "ERROR: Failed to read installed Electron version"
  exit 1
fi

rm -rf "$DEPLOY_DIR"
cd "$MONO_ROOT"
# inject-workspace-packages: required by pnpm v10's lockfile-backed deploy
# implementation. Keep this scoped to release packaging instead of changing the
# workspace install layout repo-wide.
# node-linker=hoisted: flat node_modules so every transitive dep resolves at the
# top level and electron-builder collects the complete tree.
# HUSKY=0 stops the deploy's lifecycle from re-running the repo's `prepare`
# (husky git-hook install), which is pointless during packaging and aborts the
# build when husky/git is unavailable in the release environment.
HUSKY=0 NPM_CONFIG_NODE_LINKER=hoisted NPM_CONFIG_INJECT_WORKSPACE_PACKAGES=true \
  pnpm --filter @sero/desktop deploy --prod "$DEPLOY_DIR"
cd "$PROJECT_DIR"

# Rebuild native modules against Electron's ABI inside the deploy bundle. The
# deployed copies come from the pnpm store with prebuilt/host-ABI binaries.
# electron-builder's own npmRebuild stays disabled (it cannot drive pnpm).
if pnpm --dir "$PROJECT_DIR" exec electron-rebuild -f --version "$ELECTRON_VERSION" --module-dir "$DEPLOY_DIR" -w node-pty,better-sqlite3; then
  echo "  Rebuilt native modules for Electron ${ELECTRON_VERSION} in deploy bundle"
else
  echo ""
  echo "  ⚠ electron-rebuild failed — native modules may use host Node ABI"
  echo "  (terminals and database will fail in packaged build without correct ABI)"
  exit 1
fi

node scripts/prune-release-artifacts.mjs "$DEPLOY_DIR"

# ── Step 6: Package with electron-builder ────────────────────
echo "▸ Step 6/6: Packaging with electron-builder..."
# --publish never: the GitHub `publish` stanza makes electron-builder embed
# resources/app-update.yml and (for the mac/win distributable targets) emit the
# update feed metadata (latest/beta*.yml + .blockmap). The Linux feed is produced
# by build-linux-deb.mjs instead, because the .deb is built with dpkg-deb rather
# than an electron-builder distributable target. Uploading is handled separately
# by the release workflow's `gh release upload` step, so the build must never
# push to GitHub itself (it also has no GH_TOKEN).
# Package the deploy bundle, not apps/desktop: --projectDir points electron-builder
# at the flat production tree. electronVersion is pinned explicitly because the
# `electron` devDependency is absent from the production deploy. Output is
# redirected back to apps/desktop/release where the rest of this script (and the
# release workflow) looks for artifacts.
BUILDER_ARGS=(
  --config "$DEPLOY_DIR/electron-builder.yml"
  --projectDir "$DEPLOY_DIR"
  -c.electronVersion="$ELECTRON_VERSION"
  -c.directories.output="$PROJECT_DIR/release"
  --publish never
  "$BUILDER_FLAG"
)
# Linux releases are Debian packages built with dpkg-deb after electron-builder
# creates the unpacked app directory. This keeps maintainer scripts consistent
# across architectures and avoids electron-builder's bundled fpm helper, which
# is x64-only and cannot run on native arm64 runners.
MANUAL_DEB=false
if [ "$TARGET" = "linux" ]; then
  MANUAL_DEB=true
fi
BUILDER_ARGS+=("$BUILDER_ARCH_FLAG")
if [ "$DIR_BUILD" = true ] || [ "$MANUAL_DEB" = true ]; then
  BUILDER_ARGS+=(--dir)
fi
printf '▸ electron-builder args:'
printf ' %q' "${BUILDER_ARGS[@]}"
printf '\n'

if [ "$SIGN" = true ]; then
  # Signed build — requires CSC_LINK and CSC_KEY_PASSWORD env vars
  if [ -z "${CSC_LINK:-}" ]; then
    echo "ERROR: signing requires CSC_LINK env var (path to or base64 of the .p12 certificate)"
    exit 1
  fi
  # Notarization credentials are all-or-nothing. Skip notarization only when all three are
  # absent (intentional sign-only build); if any is set, require all three and fail loudly.
  # Otherwise a partial/misnamed secret would silently ship a signed-but-not-notarized app
  # that passes `codesign --verify` yet still trips Gatekeeper for users.
  if [ -n "${APPLE_TEAM_ID:-}" ] || [ -n "${APPLE_ID:-}" ] || [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
    if [ -z "${APPLE_TEAM_ID:-}" ] || [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
      echo "ERROR: incomplete notarization credentials. Set all of APPLE_TEAM_ID, APPLE_ID, and"
      echo "       APPLE_APP_SPECIFIC_PASSWORD (check the secret names), or none for a sign-only build."
      exit 1
    fi
    echo "▸ Signing with Developer ID and notarizing via notarytool (team ${APPLE_TEAM_ID})"
    # electron-builder 25 reads APPLE_TEAM_ID / APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD from the
    # environment; notarize is enabled as a boolean (the notarize.teamId form is rejected).
    npx electron-builder "${BUILDER_ARGS[@]}" -c.mac.notarize=true
  else
    echo "▸ Signing with Developer ID (no notarization credentials present — skipping notarization)"
    npx electron-builder "${BUILDER_ARGS[@]}"
  fi
else
  # Unsigned build — skip code signing entirely (ad-hoc sealed in after-pack.mjs)
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder "${BUILDER_ARGS[@]}"
fi

if [ "$MANUAL_DEB" = true ] && [ "$DIR_BUILD" = false ]; then
  echo "▸ Building Linux .deb with dpkg-deb..."
  node scripts/build-linux-deb.mjs
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  Build complete! Output in: apps/desktop/release/"
echo ""
FOUND_ARTIFACT=false
for ARTIFACT_PATTERN in $(artifact_patterns "$TARGET"); do
  for ARTIFACT in $ARTIFACT_PATTERN; do
    if [ -e "$ARTIFACT" ]; then
      ls -lh "$ARTIFACT"
      FOUND_ARTIFACT=true
    fi
  done
done
if [ "$FOUND_ARTIFACT" = false ]; then
  echo "  (no artifacts found — check logs above)"
fi
echo "════════════════════════════════════════════════"
