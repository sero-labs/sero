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

import { execSync, execFileSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir, tmpdir } from 'os';
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

function getElectronExecutablePath() {
  return process.platform === 'darwin'
    ? 'Electron.app/Contents/MacOS/Electron'
    : process.platform === 'win32'
      ? 'electron.exe'
      : 'electron';
}

function getElectronBinaryPath(electronDir) {
  return resolve(electronDir, 'dist', getElectronExecutablePath());
}

function findElectronBinary(electronDir) {
  const overrideDist = process.env.ELECTRON_OVERRIDE_DIST_PATH;
  if (overrideDist) {
    const overrideBin = resolve(overrideDist, getElectronExecutablePath());
    if (existsSync(overrideBin)) return overrideBin;
  }

  const bin = getElectronBinaryPath(electronDir);
  return existsSync(bin) ? bin : null;
}

function installElectronBinary(electronDir) {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.error('[node-pty] ELECTRON_SKIP_BINARY_DOWNLOAD is set, so Electron cannot download its runtime binary. Unset it or set SERO_SKIP_NATIVE_REBUILD=1.');
    return null;
  }

  const installScript = resolve(electronDir, 'install.js');
  if (!existsSync(installScript)) return null;

  console.log('[node-pty] Electron package exists but binary is missing; downloading Electron...');
  try {
    execFileSync(process.execPath, [installScript], {
      cwd: electronDir,
      env: process.env,
      stdio: 'inherit',
      timeout: 180_000,
    });
  } catch (error) {
    console.error(`[node-pty] Electron binary download failed: ${error.message}`);
    return null;
  }

  return findElectronBinary(electronDir);
}

function reinstallElectronBinary(electronDir) {
  console.log('[node-pty] Electron runtime is incomplete; reinstalling it...');
  rmSync(resolve(electronDir, 'dist'), { recursive: true, force: true });
  const electronBin = installElectronBinary(electronDir);

  // Electron's installer can leave a partial macOS app bundle when extracting
  // from its cache. macOS includes `unzip`, which reliably restores framework
  // symlinks that Electron needs to start.
  if (process.platform === 'darwin') {
    const electronVersion = findElectronVersion(electronDir);
    const cacheDir = process.env.electron_config_cache
      ?? resolve(homedir(), 'Library', 'Caches', 'electron');
    const archive = electronVersion && existsSync(cacheDir)
      ? readdirSync(cacheDir).find(file => (
        file.startsWith(`electron-v${electronVersion}-darwin-`) && file.endsWith('.zip')
      ))
      : null;
    if (archive) {
      // A partial or corrupt cache archive must not abort the whole install —
      // fall through to whatever installElectronBinary already produced.
      try {
        execFileSync('unzip', ['-oq', resolve(cacheDir, archive), '-d', resolve(electronDir, 'dist')]);
        writeFileSync(resolve(electronDir, 'path.txt'), getElectronExecutablePath());
      } catch (error) {
        console.warn(`[node-pty] Could not restore Electron from cache: ${error.message}`);
      }
    }
  }

  return findElectronBinary(electronDir) ?? electronBin;
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
  const result = spawnSync(electronBin, ['-e', 'process.stdout.write(process.versions.modules)'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 15_000,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function testNodePty(electronBin, ptyDir) {
  try {
    const spawnConfig = process.platform === 'win32'
      ? {
          file: resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
          args: ['/d', '/s', '/c', 'echo __pty_ok__'],
          cwd: tmpdir(),
          envPath: process.env.Path || process.env.PATH || '',
        }
      : {
          file: '/bin/echo',
          args: ['__pty_ok__'],
          cwd: '/tmp',
          envPath: process.env.PATH || '/usr/bin:/bin',
        };
    const script = `
      const pty = require(${JSON.stringify(ptyDir)});
      const config = ${JSON.stringify(spawnConfig)};
      const p = pty.spawn(config.file, config.args, {
        name: 'xterm-256color', cols: 80, rows: 24, cwd: config.cwd,
        env: { ...process.env, PATH: config.envPath, Path: config.envPath }
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
    console.error('[node-pty] Electron package not found. Set SERO_SKIP_NATIVE_REBUILD=1 to skip intentionally.');
    process.exit(1);
  }

  let electronBin = findElectronBinary(electronDir) ?? installElectronBinary(electronDir);
  if (!electronBin) {
    console.error('[node-pty] Electron binary not found. Run `pnpm rebuild electron` or set SERO_SKIP_NATIVE_REBUILD=1 to skip intentionally.');
    process.exit(1);
  }

  const electronVersion = findElectronVersion(electronDir);
  if (!electronVersion) {
    console.error('[node-pty] Could not determine Electron version.');
    process.exit(1);
  }

  let electronAbi = getElectronModulesAbi(electronBin);
  if (!electronAbi) {
    electronBin = reinstallElectronBinary(electronDir);
    electronAbi = electronBin ? getElectronModulesAbi(electronBin) : null;
  }
  if (!electronAbi) {
    console.error('[node-pty] Could not determine Electron module ABI.');
    process.exit(1);
  }

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
