#!/bin/bash
cd "$(dirname "$0")/.."

# Kill any existing instances
pkill -f "vite" 2>/dev/null
pkill -f "electron ." 2>/dev/null
sleep 1

# Build Electron main + preload (so we always run latest code)
node scripts/build-electron.mjs

# ── Start remote dev server (todo extension) ──────────────────
# The remote must be up before the host so MF can fetch remoteEntry.js
REMOTE_DIR="$(cd ../packages/pi-todo-extension/ui && pwd)"
(cd "$REMOTE_DIR" && npx vite) > /tmp/sero-remote-todo.log 2>&1 &
REMOTE_PID=$!

# Wait for remote to be ready
for i in {1..10}; do
  curl -s http://localhost:5174/remoteEntry.js > /dev/null 2>&1 && break
  sleep 1
done

# ── Start host dev server (Sero) ─────────────────────────────
npx vite > /tmp/sero-vite.log 2>&1 &
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
echo "  Remote (todo) = $REMOTE_PID  → http://localhost:5174"
echo "  Host (vite)   = $VITE_PID   → http://localhost:5173"
echo "  Electron      = $ELECTRON_PID"
echo ""
echo "Logs:"
echo "  /tmp/sero-vite.log"
echo "  /tmp/sero-remote-todo.log"
echo "  /tmp/sero-electron.log"
