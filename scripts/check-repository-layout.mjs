#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDocsRoot = path.join(repoRoot, 'docs');

if (fs.existsSync(legacyDocsRoot)) {
  console.error('Root docs/ is not allowed. Use apps/docs-site/docs, an owning README, or GitHub issues and PRs.');
  process.exitCode = 1;
}
