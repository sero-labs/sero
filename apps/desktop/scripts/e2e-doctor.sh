#!/usr/bin/env bash
# e2e-doctor: verify machine prerequisites for the Sero e2e suite.
#
# Exits 0 if the requested layer can run, 1 otherwise. The layer is the
# first positional arg ("contract" | "workflow" | "agent" | "all").
# Defaults to "all". Output is human-readable; consume from terminals.

set -euo pipefail

LAYER="${1:-all}"
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=1; }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then ok "$1 ($(command -v "$1"))"
  else bad "missing: $1"
  fi
}

section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

section "Core (all layers)"
require_cmd node
require_cmd pnpm
require_cmd npx
require_cmd git

OS="$(uname -s)"
ok "OS: $OS"

if [[ "$LAYER" == "workflow" || "$LAYER" == "all" ]]; then
  section "Workflow layer"
  case "$OS" in
    Darwin)
      if command -v container >/dev/null 2>&1; then ok "apple container runtime"
      else warn "container binary missing — apple-container tests will skip"
      fi
      ;;
    Linux)
      require_cmd docker
      if [[ -n "${DISPLAY:-}" ]] || command -v xvfb-run >/dev/null 2>&1; then
        ok "display available (\$DISPLAY or xvfb-run)"
      else
        bad "no \$DISPLAY and no xvfb-run — Electron UI won't render"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      ok "Git Bash detected"
      ;;
    *)
      warn "unrecognised OS \"$OS\" — workflow layer support is best-effort"
      ;;
  esac
fi

if [[ "$LAYER" == "agent" || "$LAYER" == "all" ]]; then
  section "Agent layer"
  if [[ -f "apps/desktop/e2e/.env.test" ]]; then ok ".env.test present"
  else warn ".env.test missing — copy from .env.test.example and add an API key"
  fi
  if [[ "${SERO_E2E_LLM_MODE:-off}" != "off" ]]; then
    ok "SERO_E2E_LLM_MODE=${SERO_E2E_LLM_MODE}"
  else
    warn "SERO_E2E_LLM_MODE unset or 'off' — agent tests will skip"
  fi
fi

printf '\n'
if [[ $FAIL -eq 0 ]]; then
  ok "ready: e2e $LAYER"
  exit 0
else
  bad "not ready — fix the above and re-run"
  exit 1
fi
