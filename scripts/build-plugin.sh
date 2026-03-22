#!/usr/bin/env bash
#
# Build a Sero plugin package for distribution.
#
# Usage:
#   bash scripts/build-plugin.sh packages/pi-todo-extension
#   bash scripts/build-plugin.sh packages/pi-spotify-extension
#
# Produces a ready-to-install package in <package>/dist/plugin/ with:
#   - dist/ui/         Pre-built MF remote (remoteEntry.js, chunks, manifest)
#   - extension/       Bundled Pi extension entrypoints (JS)
#   - shared/          Transpiled shared modules (JS)
#   - prompts/skills/  Copied package resources referenced by package.json
#   - package.json     Cleaned manifest with compiled pi.extensions paths
#
# Prerequisites: pnpm install from monorepo root.

set -euo pipefail

node scripts/build-plugin.mjs "$@"
