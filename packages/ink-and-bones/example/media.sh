#!/bin/sh
# Regenerate the README's pictures. Dev only — commit what it writes.
set -e
cd "$(dirname "$0")"
ESBUILD="$(ls -d ../../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | head -1)"
[ -n "$ESBUILD" ] || ESBUILD="esbuild"
"$ESBUILD" media.ts --bundle --outfile=/tmp/ink-media.cjs --format=cjs --platform=node
node /tmp/ink-media.cjs "$(pwd)/media"
