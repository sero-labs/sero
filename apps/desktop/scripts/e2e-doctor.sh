#!/usr/bin/env bash
# e2e-doctor: verify machine prerequisites for the Sero e2e suite.
#
# Exits 0 if the requested layer can run, 1 otherwise. The layer is the
# first positional arg ("contract" | "workflow" | "agent" | "all").
# Defaults to "all". Output is human-readable; consume from terminals.

set -euo pipefail

LAYER="${1:-all}"
RUNTIME="${SERO_E2E_RUNTIME:-host}"
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0
AGENT_SKIPPED=0

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
ARCH="$(uname -m)"
ok "OS: $OS"
ok "arch: $ARCH"

if [[ "$LAYER" == "workflow" || "$LAYER" == "all" ]]; then
  section "Workflow layer"
  ok "SERO_E2E_RUNTIME=$RUNTIME"
  if [[ "${SERO_E2E_HOST_RELEASE_SMOKE:-0}" == "1" ]]; then
    if [[ "$RUNTIME" == "host" ]]; then ok "release smoke uses host runtime"
    else bad "release smoke requires SERO_E2E_RUNTIME=host"
    fi
    if [[ "${SERO_HOST_FIRST:-0}" == "1" ]]; then ok "SERO_HOST_FIRST=1"
    else bad "release smoke requires SERO_HOST_FIRST=1"
    fi
    if [[ -z "${SERO_BROWSER_PACK_BASE_URL:-}" ]]; then ok "browser-pack release metadata will be used"
    else bad "release smoke must not use SERO_BROWSER_PACK_BASE_URL overrides"
    fi
  fi
  case "$OS" in
    Darwin)
      if [[ "${SERO_E2E_HOST_RELEASE_SMOKE:-0}" == "1" && "$ARCH" != "arm64" ]]; then
        bad "host release smoke supports macOS arm64 only; got $ARCH"
      fi
      case "$RUNTIME" in
        host) ok "macOS host runtime selected" ;;
        apple-container)
          if command -v container >/dev/null 2>&1; then ok "apple container runtime"
          else bad "container binary missing — apple-container workflow cannot run"
          fi
          ;;
        *) bad "unsupported macOS workflow runtime: $RUNTIME (expected host or apple-container)" ;;
      esac
      ;;
    Linux)
      if [[ "${SERO_E2E_HOST_RELEASE_SMOKE:-0}" == "1" && "$ARCH" != "x86_64" && "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
        bad "host release smoke supports Linux x64/arm64 only; got $ARCH"
      fi
      case "$RUNTIME" in
        host) ok "Linux host runtime selected" ;;
        docker) require_cmd docker ;;
        *) bad "unsupported Linux workflow runtime: $RUNTIME (expected host or docker)" ;;
      esac
      if [[ -n "${DISPLAY:-}" ]] || command -v xvfb-run >/dev/null 2>&1; then
        ok "display available (\$DISPLAY or xvfb-run)"
      else
        bad "no \$DISPLAY and no xvfb-run — Electron UI won't render"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      if [[ "${SERO_E2E_HOST_RELEASE_SMOKE:-0}" == "1" && "$ARCH" != "x86_64" ]]; then
        bad "host release smoke supports Windows x64 only; got $ARCH"
      fi
      case "$RUNTIME" in
        host) ok "Windows host runtime selected" ;;
        *) bad "unsupported Windows workflow runtime: $RUNTIME (expected host)" ;;
      esac
      ok "Git Bash detected"
      ;;
    *)
      warn "unrecognised OS \"$OS\" — workflow layer support is best-effort"
      ;;
  esac
fi

if [[ "$LAYER" == "agent" || "$LAYER" == "all" ]]; then
  section "Agent layer"
  AGENT_OPT_OUT=0
  if [[ "${SERO_E2E_SKIP_AGENT:-0}" == "1" ]]; then
    AGENT_OPT_OUT=1
    AGENT_SKIPPED=1
    warn "SERO_E2E_SKIP_AGENT=1 — agent layer explicitly skipped"
  fi

  AGENT_READY=1
  if [[ -f "$DESKTOP_DIR/e2e/.env.test" ]]; then ok ".env.test present"
  else
    AGENT_READY=0
    warn ".env.test missing — copy from .env.test.example and add an API key"
  fi
  if [[ "${SERO_E2E_LLM_MODE:-off}" != "off" ]]; then
    ok "SERO_E2E_LLM_MODE=${SERO_E2E_LLM_MODE}"
  else
    AGENT_READY=0
    warn "SERO_E2E_LLM_MODE unset or 'off' — agent tests will skip"
  fi

  if [[ "$AGENT_READY" -eq 0 ]]; then
    AGENT_SKIPPED=1
    if [[ "$LAYER" == "agent" && "$AGENT_OPT_OUT" -eq 0 ]]; then
      bad "agent layer prerequisites missing — set SERO_E2E_SKIP_AGENT=1 only when intentionally skipping agent coverage"
    elif [[ "$LAYER" == "all" ]]; then
      warn "e2e all can run contract/workflow checks, but agent coverage is skipped"
    fi
  fi
fi

printf '\n'
if [[ $FAIL -eq 0 ]]; then
  if [[ "$LAYER" == "all" && "$AGENT_SKIPPED" -eq 1 ]]; then
    ok "ready: e2e all (agent layer skipped; configure .env.test and SERO_E2E_LLM_MODE for full coverage)"
  elif [[ "$LAYER" == "agent" && "$AGENT_SKIPPED" -eq 1 ]]; then
    ok "ready: e2e agent skipped by explicit opt-out"
  else
    ok "ready: e2e $LAYER"
  fi
  exit 0
else
  bad "not ready — fix the above and re-run"
  exit 1
fi
