#!/bin/sh
# Bundle the example page. The committed dist/bundle.js means the page works
# with no build step; rerun this after editing the source.
set -e
cd "$(dirname "$0")"
ESBUILD="$(ls -d ../../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | head -1)"
[ -n "$ESBUILD" ] || ESBUILD="esbuild"
"$ESBUILD" main.ts --bundle --outfile=dist/bundle.js --format=iife
echo "built dist/bundle.js"
