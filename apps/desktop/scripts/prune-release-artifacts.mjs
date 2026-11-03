#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const deployDir = process.argv[2];

if (!deployDir) {
  console.error('Usage: node scripts/prune-release-artifacts.mjs <deploy-dir>');
  process.exit(1);
}

const webPluginNodeModules = path.join(
  deployDir,
  'dist/electron/builtin/plugins/sero-web-plugin/node_modules',
);
const appNodeModules = path.join(deployDir, 'node_modules');

const webPluginPrunedPaths = [
  // better-sqlite3 needs lib/ and one prebuilt binary at runtime. The SQLite
  // source tree is only needed before electron-rebuild runs.
  'better-sqlite3/deps',
  'better-sqlite3/src',
  'better-sqlite3/binding.gyp',
  // Type declarations and repository metadata are not used by packaged Sero.
  'linkedom/types',
  'linkedom/.github',
  'unpdf/dist/types',
  'unpdf/dist/index.d.cts',
  'unpdf/dist/index.d.mts',
  'unpdf/dist/index.d.ts',
  'unpdf/dist/pdfjs.d.mts',
  'unpdf/dist/pdfjs.d.ts',
];

const appPrunedPaths = [
  // The esbuild JS API resolves the platform package binary under @esbuild/*.
  // The top-level bin copy is a duplicate in packaged Sero.
  'esbuild/bin/esbuild',
];

function prunePaths(rootDir, relativePaths) {
  for (const relativePath of relativePaths) {
    const target = path.join(rootDir, relativePath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

// better-sqlite3 ships a Node-API binary for every platform in prebuilds/ and
// loads the one named for the running platform. Releases are always built on
// the platform they target, so keep only that binary, using the library's own
// naming rule (lib/binding.js).
function sqlitePrebuildName() {
  const isMusl = process.platform === 'linux'
    && !process.report.getReport().header.glibcVersionRuntime;
  return `${isMusl ? 'linuxmusl' : process.platform}-${process.arch}.node`;
}

function pruneSqlitePrebuilds(nodeModulesDir) {
  const prebuildsDir = path.join(nodeModulesDir, 'better-sqlite3/prebuilds');
  const keep = sqlitePrebuildName();
  if (!fs.existsSync(path.join(prebuildsDir, keep))) {
    console.error(`ERROR: better-sqlite3 has no prebuilt binary ${keep} in ${prebuildsDir}`);
    process.exit(1);
  }
  for (const file of fs.readdirSync(prebuildsDir)) {
    if (file !== keep) fs.rmSync(path.join(prebuildsDir, file), { force: true });
  }
}

prunePaths(webPluginNodeModules, webPluginPrunedPaths);
prunePaths(appNodeModules, appPrunedPaths);
pruneSqlitePrebuilds(webPluginNodeModules);

console.log('  Pruned release-only package artifacts');
