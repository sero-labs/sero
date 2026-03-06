#!/bin/bash
#
# Rebuild the Electron main process and restart Electron.
# Keeps Vite dev servers running — much faster than a full dev.sh restart.
#
# Usage: bash scripts/rebuild-electron.sh
#
cd "$(dirname "$0")/.."

# 1. Build main + preload
echo "⚡ Building Electron main + preload…"
node scripts/build-electron.mjs

# 2. Kill running Electron (but not Vite)
pkill -f "electron.*sero" 2>/dev/null
sleep 0.5

# 3. Restart Electron
echo "🚀 Restarting Electron…"
NODE_ENV=development npx electron . > /tmp/sero-electron.log 2>&1 &
echo "   PID = $!  (logs → /tmp/sero-electron.log)"
