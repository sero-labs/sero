#!/usr/bin/env bash
# Run Sero evals via promptfoo.
#
# Usage:
#   ./eval/run.sh                           # Run all agent scenarios
#   ./eval/run.sh --filter-first-n 3        # Run first 3 tests
#   ./eval/run.sh --no-cache                # Skip cache
#   ./eval/run.sh snapshot                  # Run prompt-stability checks only (no API key needed)
#
# Requires ANTHROPIC_API_KEY in environment (except for snapshot mode).
set -euo pipefail
cd "$(dirname "$0")/.."

# Ensure drizzle-orm patch is applied (workaround for async tx bug)
node eval/patch-drizzle.cjs

if [[ "${1:-}" == "snapshot" ]]; then
  shift
  exec npx promptfoo eval --config eval/promptfoo-snapshot.yaml --no-cache "$@"
else
  exec npx promptfoo eval "$@"
fi
