#!/usr/bin/env bash
# Run Sero evals via promptfoo.
#
# Usage:
#   ./eval/run.sh                           # Run all scenarios
#   ./eval/run.sh --filter-first-n 3        # Run first 3 tests
#   ./eval/run.sh --no-cache                # Skip cache
#
# Requires ANTHROPIC_API_KEY in environment.
set -euo pipefail
cd "$(dirname "$0")/.."

# Ensure drizzle-orm patch is applied (workaround for async tx bug)
node eval/patch-drizzle.cjs

exec npx promptfoo eval "$@"
