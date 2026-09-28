// Runs the QMD index test under Electron's Node, where QMD's native
// better-sqlite3 build loads. Plain `pnpm test` skips that test.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(pluginRoot, '../../apps/desktop/package.json'));
const electron = require('electron');

const result = spawnSync(
  electron,
  [path.join(pluginRoot, 'node_modules/vitest/vitest.mjs'), 'run', 'extension/__tests__/qmd-index.test.ts'],
  { cwd: pluginRoot, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
);
process.exit(result.status ?? 1);
