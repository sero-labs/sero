#!/bin/bash
cd "$(dirname "$0")/.."

# Kill any existing instances
pkill -f "vite.*sero" 2>/dev/null
pkill -f "electron ." 2>/dev/null
sleep 1

# Start Vite
npx vite > /tmp/sero-vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to be ready
for i in {1..10}; do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done

# Start Electron
NODE_ENV=development npx electron . > /tmp/sero-electron.log 2>&1 &
ELECTRON_PID=$!

echo "Sero running — Vite=$VITE_PID Electron=$ELECTRON_PID"
echo "Logs: /tmp/sero-vite.log, /tmp/sero-electron.log"
