#!/usr/bin/env bash
# Inspect or replay retained OpenShell eval failure artifacts.
#
# Usage:
#   ./eval/openshell-replay.sh list
#   ./eval/openshell-replay.sh show <sandbox-or-artifact-dir>
#   ./eval/openshell-replay.sh exec <sandbox-or-artifact-dir> -- 'pwd && ls -la'
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_RESULTS_DIR="$ROOT_DIR/eval/output/openshell"

usage() {
  cat <<'USAGE'
Inspect or replay retained OpenShell eval failure artifacts.

Usage:
  ./eval/openshell-replay.sh list
  ./eval/openshell-replay.sh show <sandbox-or-artifact-dir>
  ./eval/openshell-replay.sh exec <sandbox-or-artifact-dir> -- 'pwd && ls -la'
USAGE
}

artifact_dir_for() {
  local input="$1"
  if [[ -f "$input/result.json" ]]; then
    printf '%s\n' "$input"
    return
  fi
  if [[ -f "$DEFAULT_RESULTS_DIR/$input/result.json" ]]; then
    printf '%s\n' "$DEFAULT_RESULTS_DIR/$input"
    return
  fi
  echo "No OpenShell eval artifact found for: $input" >&2
  exit 1
}

json_field() {
  local file="$1"
  local expr="$2"
  node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const value=(${expr}); if (value !== undefined && value !== null) process.stdout.write(String(value));" "$file"
}

list_artifacts() {
  if [[ ! -d "$DEFAULT_RESULTS_DIR" ]]; then
    echo "No OpenShell eval artifacts found at $DEFAULT_RESULTS_DIR"
    return
  fi

  find "$DEFAULT_RESULTS_DIR" -mindepth 2 -maxdepth 2 -name result.json | sort | while read -r result; do
    local sandbox failed retained provider gateway
    sandbox="$(json_field "$result" 'data.metadata?.sandboxName')"
    failed="$(json_field "$result" 'data.failed')"
    retained="$(json_field "$result" 'data.metadata?.retainedSandbox')"
    provider="$(json_field "$result" 'data.metadata?.providerId')"
    gateway="$(json_field "$result" 'data.metadata?.gatewayName')"
    printf '%s\tprovider=%s\tgateway=%s\tfailed=%s\tretained=%s\n' "$sandbox" "$provider" "$gateway" "$failed" "$retained"
  done
}

show_artifact() {
  local dir result
  dir="$(artifact_dir_for "$1")"
  result="$dir/result.json"

  node - <<'NODE' "$result"
const fs = require('node:fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const meta = result.metadata ?? {};
console.log(`Artifact: ${meta.artifactPath ?? ''}`);
console.log(`Provider: ${meta.providerId ?? ''}`);
console.log(`Gateway: ${meta.gatewayName ?? ''}`);
console.log(`Sandbox: ${meta.sandboxName ?? ''}`);
console.log(`Runtime workspace: ${meta.runtimeWorkspacePath ?? ''}`);
console.log(`Failed: ${result.failed}`);
console.log(`Retained sandbox: ${meta.retainedSandbox}`);
if (result.error) console.log(`Error: ${result.error}`);
console.log('\nCommands:');
for (const command of meta.commands ?? []) {
  console.log(`- exit=${command.exitCode} cwd=${command.runtimeCwd}`);
  console.log(indent(command.command));
  if (command.stdout) console.log(indent(`stdout:\n${command.stdout}`));
  if (command.stderr) console.log(indent(`stderr:\n${command.stderr}`));
}
if ((meta.logLines ?? []).length > 0) {
  console.log('\nRecent logs:');
  for (const line of meta.logLines) console.log(`  ${line}`);
}
function indent(value) {
  return String(value).split('\n').map((line) => `  ${line}`).join('\n');
}
NODE
}

exec_in_sandbox() {
  local dir result gateway sandbox workdir
  dir="$(artifact_dir_for "$1")"
  result="$dir/result.json"
  shift
  if [[ "${1:-}" == "--" ]]; then shift; fi
  if [[ $# -eq 0 ]]; then
    echo "Missing command to execute." >&2
    exit 1
  fi

  gateway="$(json_field "$result" 'data.metadata?.gatewayName')"
  sandbox="$(json_field "$result" 'data.metadata?.sandboxName')"
  workdir="$(json_field "$result" 'data.metadata?.runtimeWorkspacePath')"
  echo "Replaying in OpenShell sandbox=$sandbox gateway=$gateway workdir=$workdir" >&2
  openshell --gateway "$gateway" sandbox exec -n "$sandbox" --workdir "$workdir" --no-tty -- sh -lc "$*"
}

case "${1:-}" in
  list)
    list_artifacts
    ;;
  show)
    [[ $# -eq 2 ]] || { usage; exit 1; }
    show_artifact "$2"
    ;;
  exec)
    [[ $# -ge 3 ]] || { usage; exit 1; }
    shift
    exec_in_sandbox "$@"
    ;;
  -h|--help|help|'')
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
