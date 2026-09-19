#!/bin/bash
# Run the UX-audit capture spec against the isolated home.
#
#   ./run-capture.sh <repo> <scratch-dir> [playwright args...]
#
# Extra arguments pass straight through, so `-g architect` re-captures one area
# after a selector fix without redoing the rest. The register merges by frame id.
set -uo pipefail

REPO="${1:?usage: run-capture.sh <repo> <scratch-dir> [playwright args...]}"
SCRATCH="${2:?usage: run-capture.sh <repo> <scratch-dir> [playwright args...]}"
shift 2
cd "$REPO/apps/desktop"

# env -u ELECTRON_RUN_AS_NODE: an inherited value makes Electron start as plain
# Node and the launch hangs with no window.
env -u ELECTRON_RUN_AS_NODE \
  SERO_E2E_UX_AUDIT=1 \
  SERO_E2E_AUDIT_HOME="$SCRATCH/audit-home" \
  SERO_E2E_AUDIT_OUT="$SCRATCH/shots" \
  npx playwright test e2e/ux-audit.workflow.spec.ts --project=workflow --reporter=list "$@" 2>&1 | tail -80
