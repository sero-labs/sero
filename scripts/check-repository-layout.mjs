#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDocsRoot = path.join(repoRoot, 'docs');
const uiDeepImportRoots = [
  'plugins/sero-design-library-plugin/ui',
  'plugins/sero-orchestrator-plugin/ui',
];

if (fs.existsSync(legacyDocsRoot)) {
  console.error('Root docs/ is not allowed. Use apps/docs-site/docs, an owning README, or GitHub issues and PRs.');
  process.exitCode = 1;
}

const bareUiImportPattern = /(['"])@sero-ai\/ui\1/;
const bareUiImports = [];

for (const relativeRoot of uiDeepImportRoots) {
  const root = path.join(repoRoot, relativeRoot);
  const directories = [root];

  while (directories.length > 0) {
    const directory = directories.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(entryPath);
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name) && bareUiImportPattern.test(fs.readFileSync(entryPath, 'utf8'))) {
        bareUiImports.push(path.relative(repoRoot, entryPath));
      }
    }
  }
}

if (bareUiImports.length > 0) {
  console.error(
    `Bare @sero-ai/ui imports are not allowed in these plugin UIs. Use component subpaths:\n${bareUiImports.join('\n')}`,
  );
  process.exitCode = 1;
}
