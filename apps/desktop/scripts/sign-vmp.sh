#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# sign-vmp.sh — VMP-sign the castlabs Electron binary for Widevine DRM
#
# Services like Spotify require a production VMP (Verified Media Path)
# signature on the Electron binary. Without it the Widevine license
# server returns 500 on every license request.
#
# Prerequisites (one-time):
#   pipx install castlabs-evs
#   evs-account signup          # creates a free castlabs EVS account
#
# Run after:  pnpm install  (which downloads the Electron binary)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ELECTRON_DIST="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron/dist"

if ! command -v evs-vmp &>/dev/null; then
  echo "❌  evs-vmp not found. Install with:  pipx install castlabs-evs"
  exit 1
fi

if [ ! -d "$ELECTRON_DIST" ]; then
  echo "❌  Electron dist not found at $ELECTRON_DIST — run pnpm install first."
  exit 1
fi

echo "🔏  Signing Electron binary for VMP…"
evs-vmp sign-pkg "$ELECTRON_DIST"

echo ""
echo "✅  VMP signature applied. Verifying…"
evs-vmp verify-pkg "$ELECTRON_DIST"
