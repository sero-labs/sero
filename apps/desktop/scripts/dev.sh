#!/bin/bash
#
# Sero development launcher — auto-discovers app packages.
#
# Scans workspace app package.json files for sero.app.devPort to determine
# which remote Vite dev servers to start. No hardcoded app list needed.
#
# ── Selective dev mode ────────────────────────────────────────
#
# By default, ALL discovered apps start dev servers. To run only specific
# apps in dev mode (and load the rest from pre-built bundles via sero-ext://),
# set SERO_DEV_APPS to a comma-separated list of app IDs:
#
#   SERO_DEV_APPS=todo,kanban bash scripts/dev.sh
#
# Apps not in the list must have been built first (pnpm build in their dir).
# Use SERO_DEV_APPS=none to skip all remote dev servers entirely.
#
cd "$(dirname "$0")/.."

PACKAGES_DIR="$(cd ../../packages && pwd)"
PLUGINS_DIR="$(cd ../../plugins && pwd)"
SERO_DEV_APPS="${SERO_DEV_APPS:-}"

# ── Cleanup trap ────────────────────────────────────────────
CHILD_PIDS=()

cleanup() {
  echo ""
  echo "Shutting down Sero dev processes..."

  for pid in "${CHILD_PIDS[@]}"; do
    pkill -TERM -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
  done

  for port in "${KILL_PORTS[@]}"; do
    lsof -ti :"$port" 2>/dev/null | xargs kill -9 2>/dev/null
  done
  pkill -f "electron.*sero" 2>/dev/null

  sleep 1
  for pid in "${CHILD_PIDS[@]}"; do
    pkill -9 -P "$pid" 2>/dev/null
    kill -9 "$pid" 2>/dev/null
  done

  wait 2>/dev/null
  echo "All dev processes stopped."
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

# ── Filter by SERO_DEV_APPS ─────────────────────────────────
REMOTE_NAMES=()
REMOTE_DIRS=()
REMOTE_PORTS=()
SKIPPED_NAMES=()

if [ -n "$SERO_DEV_APPS" ] && [ "$SERO_DEV_APPS" != "all" ]; then
  IFS=',' read -ra DEV_LIST <<< "$SERO_DEV_APPS"

  for i in "${!ALL_NAMES[@]}"; do
    name="${ALL_NAMES[$i]}"
    matched=false

    if [ "$SERO_DEV_APPS" != "none" ]; then
      for dev_app in "${DEV_LIST[@]}"; do
        dev_app="$(echo "$dev_app" | xargs)"
        if [ "$dev_app" = "$name" ]; then
          matched=true
          break
        fi
      done
    fi

    if $matched; then
      REMOTE_NAMES+=("$name")
      REMOTE_DIRS+=("${ALL_DIRS[$i]}")
      REMOTE_PORTS+=("${ALL_PORTS[$i]}")
    else
      SKIPPED_NAMES+=("$name")
    fi
  done
else
  REMOTE_NAMES=("${ALL_NAMES[@]}")
  REMOTE_DIRS=("${ALL_DIRS[@]}")
  REMOTE_PORTS=("${ALL_PORTS[@]}")
fi

# ── Kill existing instances ───────────────────────────────────
KILL_PORTS=(5173 "${ALL_PORTS[@]}")
for port in "${KILL_PORTS[@]}"; do
  lsof -ti :"$port" | xargs kill -9 2>/dev/null
done
pkill -f "electron.*sero" 2>/dev/null
sleep 1

WEB_REMOTE_DIR="$(cd ../../apps/web-remote && pwd)"
if [ -f "$WEB_REMOTE_DIR/package.json" ]; then
  (cd "$WEB_REMOTE_DIR" && npx vite build) > /tmp/sero-web-remote-build.log 2>&1
  echo "  Built web-remote SPA"
  (cd "$WEB_REMOTE_DIR" && exec npx vite build --watch) > /tmp/sero-web-remote-watch.log 2>&1 &
  WEB_REMOTE_PID=$!
  CHILD_PIDS+=($WEB_REMOTE_PID)
fi

node scripts/build-electron.mjs

# ── Start remote dev servers ──────────────────────────────────
REMOTE_PIDS=()
for i in "${!REMOTE_DIRS[@]}"; do
  dir="${REMOTE_DIRS[$i]}"
  name="${REMOTE_NAMES[$i]}"
  (cd "$dir" && exec npx vite) > "/tmp/sero-remote-${name}.log" 2>&1 &
  pid=$!
  REMOTE_PIDS+=($pid)
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

SERO_DEV_APPS="$SERO_DEV_APPS" npx vite > /tmp/sero-vite.log 2>&1 &
VITE_PID=$!
CHILD_PIDS+=($VITE_PID)

for attempt in {1..10}; do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done

SERO_DEV_APPS="$SERO_DEV_APPS" NODE_ENV=development npx electron . > /tmp/sero-electron.log 2>&1 &
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
echo "  /tmp/sero-vite.log"
for name in "${REMOTE_NAMES[@]}"; do
  echo "  /tmp/sero-remote-${name}.log"
done
[ -n "$WEB_REMOTE_PID" ] && echo "  /tmp/sero-web-remote-watch.log"
echo "  /tmp/sero-electron.log"
echo ""

wait $ELECTRON_PID 2>/dev/null
