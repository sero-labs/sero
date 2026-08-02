#!/bin/sh
# Bundle the spike into dist/bundle.js. Standalone — uses the repo's esbuild.
set -e
cd "$(dirname "$0")"
ESBUILD="../../node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild"
[ -x "$ESBUILD" ] || ESBUILD="$(command -v esbuild)"
"$ESBUILD" src/main.ts --bundle --format=iife --outfile=dist/bundle.js
echo "built dist/bundle.js — open index.html in a browser"
