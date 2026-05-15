#!/usr/bin/env node
/**
 * Ensures node-pty's native binary matches the Electron ABI.
 *
 * Sero loads node-pty in Electron's main process, so rebuilding against the
 * host Node.js ABI is not enough. This script smoke-tests node-pty inside the
 * active desktop Electron runtime and rebuilds it with electron-rebuild when
 * needed.
 *
 * Called from root package.json `postinstall`.
 */

import { execSync, execFileSync } from 'child_process';
import { existsSync, readdirSync, realpathSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DESKTOP = resolve(ROOT, 'apps/desktop');
const PNPM_STORE = resolve(ROOT, 'node_modules/.pnpm');
const req = createRequire(import.meta.url);

const NODE_PTY_LINK = resolve(DESKTOP, 'node_modules/node-pty');
const NODE_PTY_PKG = resolve(PNPM_STORE, 'node-pty@1.1.0/node_modules/node-pty');

function findNodePtyDir() {
  if (existsSync(NODE_PTY_LINK)) return realpathSync(NODE_PTY_LINK);
  if (existsSync(NODE_PTY_PKG)) return NODE_PTY_PKG;
  return null;
}

function findElectronPackageDir() {
  const desktopElectron = resolve(DESKTOP, 'node_modules/electron');
  if (existsSync(desktopElectron)) return desktopElectron;

  if (!existsSync(PNPM_STORE)) return null;
  const entries = readdirSync(PNPM_STORE)
    .filter(e => e.startsWith('electron@'))
    .sort()
    .reverse();
  for (const entry of entries) {
    const pkgDir = resolve(PNPM_STORE, entry, 'node_modules/electron');
    if (existsSync(pkgDir)) return pkgDir;
  }
  return null;
}

function findElectronBinary(electronDir) {
  const bin = resolve(electronDir, 'dist/Electron.app/Contents/MacOS/Electron');
  return existsSync(bin) ? bin : null;
}

function findElectronVersion(electronDir) {
  const pkgJson = resolve(electronDir, 'package.json');
  if (!existsSync(pkgJson)) return null;
  try {
    const { version } = req(pkgJson);
    return version.split('+')[0];
  } catch {
    return null;
  }
}

function getElectronModulesAbi(electronBin) {
  const result = execFileSync(
    electronBin,
    ['-e', 'process.stdout.write(process.versions.modules)'],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 15_000,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  return result.trim();
}

function testNodePty(electronBin, ptyDir) {
  try {
    const script = `
      const pty = require(${JSON.stringify(ptyDir)});
      const p = pty.spawn('/bin/echo', ['__pty_ok__'], {
        name: 'xterm-256color', cols: 80, rows: 24, cwd: '/tmp',
        env: { PATH: process.env.PATH || '/usr/bin:/bin' }
      });
      let out = '';
      p.onData(d => { out += d; });
      p.onExit(() => { process.exit(out.includes('__pty_ok__') ? 0 : 1); });
      setTimeout(() => process.exit(1), 5000);
    `;
    execFileSync(electronBin, ['-e', script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 10_000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function rebuild(electronVersion, electronAbi) {
  console.log(`\x1b[33m  → Rebuilding node-pty for Electron ${electronVersion} (ABI ${electronAbi})...\x1b[0m`);
  try {
    execSync(
      `pnpm --dir "${DESKTOP}" exec electron-rebuild -f --version "${electronVersion}" --force-abi "${electronAbi}" --module-dir "${ROOT}" --which-module node-pty`,
      { stdio: 'inherit', cwd: ROOT, timeout: 180_000 },
    );
    console.log('\x1b[32m  ✓ node-pty rebuilt successfully.\x1b[0m');
    return true;
  } catch {
    console.error('\x1b[31m  ✗ node-pty rebuild failed. Terminals will not work.\x1b[0m');
    console.error(`    Run manually: pnpm --dir apps/desktop exec electron-rebuild -f --version "${electronVersion}" --force-abi "${electronAbi}" --module-dir "${ROOT}" --which-module node-pty`);
    return false;
  }
}

function main() {
  if (process.env.SERO_SKIP_NATIVE_REBUILD === '1') {
    console.log('[node-pty] Skipping native rebuild because SERO_SKIP_NATIVE_REBUILD=1.');
    process.exit(0);
  }

  console.log('[node-pty] Checking native binary for Electron...');

  const ptyDir = findNodePtyDir();
  if (!ptyDir) {
    console.log('[node-pty] Not installed — skipping (not needed outside apps/desktop).');
    process.exit(0);
  }

  const electronDir = findElectronPackageDir();
  if (!electronDir) {
    console.log('[node-pty] Electron package not found — skipping (install apps/desktop first).');
    process.exit(0);
  }

  const electronBin = findElectronBinary(electronDir);
  if (!electronBin) {
    console.log('[node-pty] Electron binary not found — skipping (install apps/desktop first).');
    process.exit(0);
  }

  const electronVersion = findElectronVersion(electronDir);
  if (!electronVersion) {
    console.log('[node-pty] Could not determine Electron version — skipping.');
    process.exit(0);
  }

  const electronAbi = getElectronModulesAbi(electronBin);

  if (testNodePty(electronBin, ptyDir)) {
    console.log(`\x1b[32m[node-pty] ✓ Binary works with Electron ${electronVersion} (ABI ${electronAbi}).\x1b[0m`);
    process.exit(0);
  }

  console.log(`\x1b[33m[node-pty] ✗ Binary does not work with Electron ${electronVersion} (ABI ${electronAbi}).\x1b[0m`);

  const ok = rebuild(electronVersion, electronAbi);
  if (!ok) process.exit(1);

  if (testNodePty(electronBin, ptyDir)) {
    console.log('\x1b[32m[node-pty] ✓ Verified: rebuild works.\x1b[0m');
  } else {
    console.error('\x1b[31m[node-pty] ✗ Rebuild completed but binary still fails. Check output above.\x1b[0m');
    process.exit(1);
  }
}

main();
