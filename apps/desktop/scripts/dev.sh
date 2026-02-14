#!/bin/bash
cd "$(dirname "$0")/.."

# Kill any existing Sero-related instances (avoid killing unrelated vite/electron)
pkill -f "vite.*sero" 2>/dev/null
pkill -f "vite.*pi-todo-extension" 2>/dev/null
pkill -f "vite.*pi-weight-tracker" 2>/dev/null
pkill -f "vite.*pi-daily-quote" 2>/dev/null
pkill -f "electron.*sero" 2>/dev/null
sleep 1

# Build Electron main + preload (so we always run latest code)
node scripts/build-electron.mjs

# ── Start remote dev servers ──────────────────────────────────
# Remotes must be up before the host so MF can fetch mf-manifest.json.
# --force: avoids stale Vite dep caches that cause 504 "Outdated Optimize Dep".

REMOTE_DIR="$(cd ../../packages/pi-todo-extension && pwd)"
(cd "$REMOTE_DIR" && npx vite --force) > /tmp/sero-remote-todo.log 2>&1 &
REMOTE_PID=$!

WEIGHT_DIR="$(cd ../../packages/pi-weight-tracker && pwd)"
(cd "$WEIGHT_DIR" && npx vite --force) > /tmp/sero-remote-weight-tracker.log 2>&1 &
WEIGHT_PID=$!

QUOTE_DIR="$(cd ../../packages/pi-daily-quote && pwd)"
(cd "$QUOTE_DIR" && npx vite --force) > /tmp/sero-remote-daily-quote.log 2>&1 &
QUOTE_PID=$!

# Wait for all remotes to be ready (check mf-manifest.json)
for i in {1..15}; do
  ALL_READY=true
  curl -s http://localhost:5174/mf-manifest.json > /dev/null 2>&1 || ALL_READY=false
  curl -s http://localhost:5176/mf-manifest.json > /dev/null 2>&1 || ALL_READY=false
  curl -s http://localhost:5177/mf-manifest.json > /dev/null 2>&1 || ALL_READY=false
  $ALL_READY && break
  sleep 1
done

# ── Start host dev server (Sero) ─────────────────────────────
# --force: same reason as remotes — avoids stale dep optimisation cache.
npx vite --force > /tmp/sero-vite.log 2>&1 &
VITE_PID=$!

# Wait for host to be ready
for i in {1..10}; do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done

# ── Start Electron ────────────────────────────────────────────
NODE_ENV=development npx electron . > /tmp/sero-electron.log 2>&1 &
ELECTRON_PID=$!

echo "Sero running:"
echo "  Remote (todo)    = $REMOTE_PID  → http://localhost:5174"
echo "  Remote (weight)  = $WEIGHT_PID  → http://localhost:5176"
echo "  Remote (quote)   = $QUOTE_PID   → http://localhost:5177"
echo "  Host (vite)      = $VITE_PID   → http://localhost:5173"
echo "  Electron         = $ELECTRON_PID"
echo ""
echo "Logs:"
echo "  /tmp/sero-vite.log"
echo "  /tmp/sero-remote-todo.log"
echo "  /tmp/sero-remote-weight-tracker.log"
echo "  /tmp/sero-remote-daily-quote.log"
echo "  /tmp/sero-electron.log"
