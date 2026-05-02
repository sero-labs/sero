#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PNPM_STORE = resolve(ROOT, 'node_modules/.pnpm');
const RUNNER = resolve(ROOT, 'scripts/promptfoo-electron-runner.cjs');

function findElectronBinary() {
  if (!existsSync(PNPM_STORE)) return null;

  const entries = readdirSync(PNPM_STORE).filter(entry => entry.startsWith('electron@'));
  for (const entry of entries) {
    const binary = resolve(
      PNPM_STORE,
      entry,
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    );
    if (existsSync(binary)) {
      return binary;
    }
  }

  return null;
}

const electronBinary = findElectronBinary();
if (!electronBinary) {
  console.error('[promptfoo] Electron binary not found. Run pnpm install first.');
  process.exit(1);
}

const result = spawnSync(electronBinary, [RUNNER, ...process.argv.slice(2)], {
  cwd: ROOT,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[promptfoo] Failed to launch Electron runner: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
