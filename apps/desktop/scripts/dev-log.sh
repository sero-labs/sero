#!/bin/bash
# Start Sero with agent message logging to the console.
# All events except text_delta are printed to /tmp/sero-electron.log.
cd "$(dirname "$0")/.."
SERO_LOG_AGENT=1 exec bash scripts/dev.sh
