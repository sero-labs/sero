#!/bin/sh
# Sero CLI shim — invokes the bundled Electron binary in --doctor mode.
# Bundled at Sero.app/Contents/Resources/sero-doctor and intended to be
# symlinked (optionally, on first run) to /usr/local/bin/sero-doctor.

exec "$(dirname "$0")/../MacOS/Sero" --doctor "$@"
