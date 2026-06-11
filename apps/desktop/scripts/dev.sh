#!/bin/bash
#
# Sero development launcher — auto-discovers app packages.
#
# Scans workspace app package.json files for sero.app.devPort to determine
# which remote Vite dev servers to start. No hardcoded app list needed.
#
# ── Selective dev mode ────────────────────────────────────────
#
# By default, NO plugins start in dev mode. To run only specific plugins in
# dev mode (and load the rest from pre-built bundles via sero-ext://), set
# SERO_DEV_PLUGINS to a comma-separated list of plugin IDs:
#
#   SERO_DEV_PLUGINS=admin,git bash scripts/dev.sh
#
# Use SERO_DEV_PLUGINS=all to run every remote dev server.
#
cd "$(dirname "$0")/.."

PACKAGES_DIR="$(cd ../../packages && pwd)"
PLUGINS_DIR="$(cd ../../plugins && pwd)"
SERO_DEV_PLUGINS="${SERO_DEV_PLUGINS:-}"
SERO_LOG_DIR="${SERO_LOG_DIR:-${SERO_HOME_OVERRIDE:-$HOME/.sero-ui}/logs}"
mkdir -p "$SERO_LOG_DIR"

log_path() {
  local name="$1"
  local target="$SERO_LOG_DIR/$name"
  ln -sf "$target" "/tmp/$name" 2>/dev/null || true
  printf "%s" "$target"
}

# ── Cleanup trap ────────────────────────────────────────────
CHILD_PIDS=()
# Match the top-level Electron browser process launched by `npx electron .`.
# This avoids helper processes (`--type=...`) and survives app.relaunch().
case "$(uname -s)" in
  Darwin) ELECTRON_MAIN_MATCH_PATTERN="Contents/MacOS/Electron \\." ;;
  Linux) ELECTRON_MAIN_MATCH_PATTERN="electron/dist/electron \\." ;;
  *) ELECTRON_MAIN_MATCH_PATTERN="[Ee]lectron \\." ;;
esac
# Keep the relaunch grace window short so closing the app tears down Vite fast,
# while still tolerating the brief gap during app.relaunch() for profile switches
# and recovery flows.
ELECTRON_RELAUNCH_GRACE_ATTEMPTS=6
ELECTRON_RELAUNCH_GRACE_SLEEP=0.25
CLEANUP_GRACE_SLEEP=0.25

cleanup() {
  local cleanup_started_at
  cleanup_started_at=$(date +%s)

  echo ""
  echo "[$(date +%H:%M:%S)] Shutting down Sero dev processes..."

  for pid in "${CHILD_PIDS[@]}"; do
    pkill -TERM -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
  done

  for port in "${KILL_PORTS[@]}"; do
    lsof -ti :"$port" 2>/dev/null | xargs kill -9 2>/dev/null
  done
  pkill -f "$ELECTRON_MAIN_MATCH_PATTERN" 2>/dev/null

  sleep "$CLEANUP_GRACE_SLEEP"
  for pid in "${CHILD_PIDS[@]}"; do
    pkill -9 -P "$pid" 2>/dev/null
    kill -9 "$pid" 2>/dev/null
  done

  wait 2>/dev/null
  echo "[$(date +%H:%M:%S)] All dev processes stopped in $(( $(date +%s) - cleanup_started_at ))s."
}

# Keep the host/remotes alive across app.relaunch(). A relaunched Electron
# process is no longer the original child of this shell, so a plain `wait`
# would return and the EXIT trap would tear down Vite underneath the new app.
electron_browser_running() {
  pgrep -fal "$ELECTRON_MAIN_MATCH_PATTERN" | grep -q .
}

monitor_electron_lifecycle() {
  local relaunched=false

  while true; do
    if electron_browser_running; then
      sleep 1
      continue
    fi

    relaunched=false
    for ((attempt = 1; attempt <= ELECTRON_RELAUNCH_GRACE_ATTEMPTS; attempt++)); do
      sleep "$ELECTRON_RELAUNCH_GRACE_SLEEP"
      if electron_browser_running; then
        relaunched=true
        echo "Electron relaunched — keeping dev servers running."
        break
      fi
    done

    $relaunched || {
      echo "[$(date +%H:%M:%S)] Electron exited — starting dev cleanup."
      break
    }
  done
}

trap cleanup EXIT INT TERM

# ── Discover remote apps ──────────────────────────────────────
ALL_NAMES=()
ALL_DIRS=()
ALL_PORTS=()

PACKAGE_JSONS=()
while IFS= read -r pkg_json; do
  PACKAGE_JSONS+=("$pkg_json")
done < <(
  find "$PACKAGES_DIR" "$PLUGINS_DIR" -mindepth 2 -maxdepth 2 -name package.json | sort
)

for pkg_json in "${PACKAGE_JSONS[@]}"; do
  pkg_dir="$(dirname "$pkg_json")"

  PORT=$(node -e "
    const p = require('$pkg_json');
    if (p.sero?.app?.devPort) console.log(p.sero.app.devPort);
  " 2>/dev/null)
  [ -z "$PORT" ] && continue

  NAME=$(node -e "
    const p = require('$pkg_json');
    console.log(p.sero.app.id);
  " 2>/dev/null)

  ALL_NAMES+=("$NAME")
  ALL_DIRS+=("$pkg_dir")
  ALL_PORTS+=("$PORT")
done

# ── Filter by SERO_DEV_PLUGINS ───────────────────────────────
REMOTE_NAMES=()
REMOTE_DIRS=()
REMOTE_PORTS=()
SKIPPED_NAMES=()

if [ -z "$SERO_DEV_PLUGINS" ]; then
  SKIPPED_NAMES=("${ALL_NAMES[@]}")
elif [ "$SERO_DEV_PLUGINS" = "all" ]; then
  REMOTE_NAMES=("${ALL_NAMES[@]}")
  REMOTE_DIRS=("${ALL_DIRS[@]}")
  REMOTE_PORTS=("${ALL_PORTS[@]}")
else
  IFS=',' read -ra DEV_LIST <<< "$SERO_DEV_PLUGINS"

  for i in "${!ALL_NAMES[@]}"; do
    name="${ALL_NAMES[$i]}"
    matched=false

    for dev_plugin in "${DEV_LIST[@]}"; do
      dev_plugin="$(echo "$dev_plugin" | xargs)"
      if [ "$dev_plugin" = "$name" ]; then
        matched=true
        break
      fi
    done

    if $matched; then
      REMOTE_NAMES+=("$name")
      REMOTE_DIRS+=("${ALL_DIRS[$i]}")
      REMOTE_PORTS+=("${ALL_PORTS[$i]}")
    else
      SKIPPED_NAMES+=("$name")
    fi
  done
fi

# ── Kill existing instances ───────────────────────────────────
KILL_PORTS=(5173 "${ALL_PORTS[@]}")
for port in "${KILL_PORTS[@]}"; do
  lsof -ti :"$port" | xargs kill -9 2>/dev/null
done
pkill -f "$ELECTRON_MAIN_MATCH_PATTERN" 2>/dev/null
sleep 1

WEB_REMOTE_DIR="$(cd ../../apps/web-remote && pwd)"
if [ -f "$WEB_REMOTE_DIR/package.json" ]; then
  WEB_REMOTE_BUILD_LOG="$(log_path sero-web-remote-build.log)"
  WEB_REMOTE_WATCH_LOG="$(log_path sero-web-remote-watch.log)"
  (cd "$WEB_REMOTE_DIR" && npx vite build) > "$WEB_REMOTE_BUILD_LOG" 2>&1
  echo "  Built web-remote SPA"
  (cd "$WEB_REMOTE_DIR" && exec npx vite build --watch) > "$WEB_REMOTE_WATCH_LOG" 2>&1 &
  WEB_REMOTE_PID=$!
  CHILD_PIDS+=($WEB_REMOTE_PID)
fi

node scripts/build-electron.mjs

# ── Start remote dev servers ──────────────────────────────────
REMOTE_PIDS=()
REMOTE_LOGS=()
for i in "${!REMOTE_DIRS[@]}"; do
  dir="${REMOTE_DIRS[$i]}"
  name="${REMOTE_NAMES[$i]}"
  remote_log="$(log_path "sero-remote-${name}.log")"
  (cd "$dir" && exec npx vite) > "$remote_log" 2>&1 &
  pid=$!
  REMOTE_PIDS+=($pid)
  REMOTE_LOGS+=("$remote_log")
  CHILD_PIDS+=($pid)
done

if [ ${#REMOTE_PORTS[@]} -gt 0 ]; then
  for attempt in {1..15}; do
    ALL_READY=true
    for port in "${REMOTE_PORTS[@]}"; do
      curl -s "http://localhost:${port}/mf-manifest.json" > /dev/null 2>&1 || ALL_READY=false
    done
    $ALL_READY && break
    sleep 1
  done
fi

VITE_LOG="$(log_path sero-vite.log)"
SERO_DEV_PLUGINS="$SERO_DEV_PLUGINS" npx vite > "$VITE_LOG" 2>&1 &
VITE_PID=$!
CHILD_PIDS+=($VITE_PID)

for attempt in {1..10}; do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done

if [ "$(uname -s)" = "Linux" ]; then
  ELECTRON_BIN=$(node -e "process.stdout.write(require('electron'))" 2>/dev/null || true)
  if [ -n "$ELECTRON_BIN" ]; then
    CHROME_SANDBOX="$(dirname "$ELECTRON_BIN")/chrome-sandbox"
    if [ -e "$CHROME_SANDBOX" ] && [ ! -u "$CHROME_SANDBOX" ]; then
      export ELECTRON_DISABLE_SANDBOX="${ELECTRON_DISABLE_SANDBOX:-1}"
    fi
  fi
fi

ELECTRON_LOG="$(log_path sero-electron.log)"
SERO_DEV_PLUGINS="$SERO_DEV_PLUGINS" NODE_ENV=development npx electron . > "$ELECTRON_LOG" 2>&1 &
ELECTRON_PID=$!
CHILD_PIDS+=($ELECTRON_PID)

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "Sero running:"
for i in "${!REMOTE_NAMES[@]}"; do
  printf "  Remote (%-16s = %s  → http://localhost:%s\n" "${REMOTE_NAMES[$i]})" "${REMOTE_PIDS[$i]}" "${REMOTE_PORTS[$i]}"
done
if [ ${#SKIPPED_NAMES[@]} -gt 0 ]; then
  echo "  Skipped (pre-built):   ${SKIPPED_NAMES[*]}"
fi
echo "  Host (vite)            = $VITE_PID   → http://localhost:5173"
[ -n "$WEB_REMOTE_PID" ] && echo "  Web-remote (watch)     = $WEB_REMOTE_PID  → gateway :18800"
echo "  Electron               = $ELECTRON_PID"
echo ""
echo "Logs:"
echo "  $VITE_LOG"
for log in "${REMOTE_LOGS[@]}"; do
  echo "  $log"
done
[ -n "$WEB_REMOTE_PID" ] && echo "  $WEB_REMOTE_WATCH_LOG"
echo "  $ELECTRON_LOG"
echo "  Compatibility symlinks: /tmp/sero-*.log"
echo ""

wait $ELECTRON_PID 2>/dev/null
monitor_electron_lifecycle
