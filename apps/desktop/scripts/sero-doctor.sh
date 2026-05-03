#!/bin/sh
# Sero CLI shim — invokes the bundled Electron binary in --doctor mode.
#
# Bundled at Sero.app/Contents/Resources/sero-doctor and intended to be
# symlinked (optionally, on first run) to /usr/local/bin/sero-doctor.
#
# When invoked via a symlink, $0 points at the symlink path, so naively
# computing "$(dirname "$0")/../MacOS/Sero" resolves relative to the
# symlink's directory (e.g. /usr/local) and fails. Resolve symlinks
# before computing the app-relative path.

set -e

resolve_path() {
  # POSIX-friendly readlink loop. Walks symlinks until we hit a real file.
  target="$1"
  while [ -L "$target" ]; do
    link="$(readlink "$target")"
    case "$link" in
      /*)
        target="$link"
        ;;
      *)
        target="$(dirname "$target")/$link"
        ;;
    esac
  done
  printf '%s' "$target"
}

REAL_PATH="$(resolve_path "$0")"
REAL_DIR="$(cd "$(dirname "$REAL_PATH")" && pwd)"

exec "$REAL_DIR/../MacOS/Sero" --doctor "$@"
