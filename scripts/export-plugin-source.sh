#!/usr/bin/env bash
#
# Export a Sero plugin source package for Git-based distribution.
#
# Usage:
#   bash scripts/export-plugin-source.sh plugins/sero-kanban-plugin
#
# Produces a standalone source repo in <package>/dist/plugin-source/ with:
#   - source files (extension/, shared/, ui/, vite.config.ts, README.md, etc.)
#   - resolved catalog versions
#   - vendored unpublished workspace packages under vendor/
#   - preBuilt=false in package.json for build-on-install Git workflows
#
# Prerequisites: pnpm install from monorepo root.

set -euo pipefail

node scripts/export-plugin-source.mjs "$@"
