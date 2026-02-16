#!/bin/bash
#
# Sero development launcher — auto-discovers app packages.
#
# Scans packages/pi-*/package.json for sero.app.devPort to determine
# which remote Vite dev servers to start. No hardcoded app list needed.
#
cd "$(dirname "$0")/.."

PKGS_DIR="$(cd ../../packages && pwd)"

# ── Discover remote apps ──────────────────────────────────────
# Reads sero.app.devPort from each package.json to know what to start.

REMOTE_NAMES=()
REMOTE_DIRS=()
REMOTE_PORTS=()

for pkg in "$PKGS_DIR"/pi-*/; do
  [ -f "$pkg/package.json" ] || continue

  # Extract devPort from sero.app manifest (empty if not a sero app)
  PORT=$(node -e "
    const p = require('$pkg/package.json');
    if (p.sero?.app?.devPort) console.log(p.sero.app.devPort);
  " 2>/dev/null)
  [ -z "$PORT" ] && continue

  NAME=$(node -e "
    const p = require('$pkg/package.json');
    console.log(p.sero.app.id);
  " 2>/dev/null)

  REMOTE_NAMES+=("$NAME")
  REMOTE_DIRS+=("$pkg")
  REMOTE_PORTS+=("$PORT")
done

# ── Kill existing instances ───────────────────────────────────

KILL_PORTS=(5173 "${REMOTE_PORTS[@]}")
for port in "${KILL_PORTS[@]}"; do
  lsof -ti :"$port" | xargs kill -9 2>/dev/null
done
pkill -f "electron.*sero" 2>/dev/null
sleep 1

# Build Electron main + preload (so we always run latest code)
node scripts/build-electron.mjs

# ── Start remote dev servers ──────────────────────────────────
# Remotes must be up before the host so MF can fetch mf-manifest.json.

REMOTE_PIDS=()
for i in "${!REMOTE_DIRS[@]}"; do
  dir="${REMOTE_DIRS[$i]}"
  name="${REMOTE_NAMES[$i]}"
  (cd "$dir" && npx vite) > "/tmp/sero-remote-${name}.log" 2>&1 &
  REMOTE_PIDS+=($!)
done

# Wait for all remotes to be ready
for attempt in {1..15}; do
  ALL_READY=true
  for port in "${REMOTE_PORTS[@]}"; do
    curl -s "http://localhost:${port}/mf-manifest.json" > /dev/null 2>&1 || ALL_READY=false
  done
  $ALL_READY && break
  sleep 1
done

# ── Start host dev server (Sero) ─────────────────────────────
npx vite > /tmp/sero-vite.log 2>&1 &
VITE_PID=$!

for attempt in {1..10}; do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done

# ── Start Electron ────────────────────────────────────────────
NODE_ENV=development npx electron . > /tmp/sero-electron.log 2>&1 &
ELECTRON_PID=$!

# ── Summary ───────────────────────────────────────────────────
echo "Sero running:"
for i in "${!REMOTE_NAMES[@]}"; do
  printf "  Remote (%-16s = %s  → http://localhost:%s\n" "${REMOTE_NAMES[$i]})" "${REMOTE_PIDS[$i]}" "${REMOTE_PORTS[$i]}"
done
echo "  Host (vite)            = $VITE_PID   → http://localhost:5173"
echo "  Electron               = $ELECTRON_PID"
echo ""
echo "Logs:"
echo "  /tmp/sero-vite.log"
for name in "${REMOTE_NAMES[@]}"; do
  echo "  /tmp/sero-remote-${name}.log"
done
echo "  /tmp/sero-electron.log"
