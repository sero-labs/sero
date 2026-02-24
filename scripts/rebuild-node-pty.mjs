#!/usr/bin/env node
/**
 * Ensures node-pty's native binary matches the current Node ABI.
 *
 * WHY THIS EXISTS:
 * node-pty 1.1.0 ships prebuilt binaries for darwin-arm64, but they're
 * compiled against an older Node ABI. Its install script
 * (`node scripts/prebuild.js || node-gyp rebuild`) only checks whether
 * the prebuild DIRECTORY exists — not whether the binary actually loads.
 * So pnpm install sees the directory, skips the compile, and we get
 * `posix_spawnp failed` at runtime.
 *
 * WHAT THIS DOES:
 * 1. Tries to require() node-pty from the pnpm store
 * 2. Spawns a trivial PTY to verify it actually works
 * 3. If either step fails → runs node-gyp rebuild
 * 4. If it already works → exits immediately (no-op)
 *
 * Called from root package.json `postinstall`.
 */

import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Find node-pty in the pnpm store (hoisted into apps/desktop/node_modules)
const NODE_PTY_LINK = resolve(ROOT, 'apps/desktop/node_modules/node-pty');
const NODE_PTY_PKG = resolve(ROOT, 'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty');

/** Resolve the actual node-pty directory (prefer symlink target). */
function findNodePtyDir() {
  if (existsSync(NODE_PTY_LINK)) return NODE_PTY_LINK;
  if (existsSync(NODE_PTY_PKG)) return NODE_PTY_PKG;
  return null;
}

/**
 * Smoke-test node-pty in a **subprocess**.
 *
 * Native .node addons are cached permanently by Node's require — they
 * cannot be reloaded in the same process after a rebuild. So we must
 * always test in a fresh process to get an accurate result.
 */
function testNodePty(ptyDir) {
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
    execFileSync(process.execPath, ['-e', script], {
      timeout: 10_000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/** Run node-gyp rebuild inside the node-pty package. */
function rebuild(ptyDir) {
  console.log(`\x1b[33m  → Rebuilding node-pty for Node ${process.version} (ABI ${process.versions.modules})...\x1b[0m`);
  try {
    execSync(`npx node-gyp rebuild --directory="${ptyDir}"`, {
      stdio: 'inherit',
      cwd: ROOT,
      timeout: 120_000,
    });
    console.log('\x1b[32m  ✓ node-pty rebuilt successfully.\x1b[0m');
    return true;
  } catch (err) {
    console.error('\x1b[31m  ✗ node-pty rebuild failed. Terminals will not work.\x1b[0m');
    console.error('    Run manually: npx node-gyp rebuild --directory=node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty');
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────

function main() {
  console.log('[node-pty] Checking native binary...');

  const ptyDir = findNodePtyDir();
  if (!ptyDir) {
    console.log('[node-pty] Not installed — skipping (not needed outside apps/desktop).');
    process.exit(0);
  }

  if (testNodePty(ptyDir)) {
    console.log(`\x1b[32m[node-pty] ✓ Binary works with Node ${process.version} (ABI ${process.versions.modules}).\x1b[0m`);
    process.exit(0);
  }

  console.log(`\x1b[33m[node-pty] ✗ Binary does not work with Node ${process.version} (ABI ${process.versions.modules}).\x1b[0m`);

  // Resolve the real package dir (not the symlink) for node-gyp
  const realPtyDir = existsSync(NODE_PTY_PKG) ? NODE_PTY_PKG : ptyDir;
  const ok = rebuild(realPtyDir);

  if (ok) {
    // Verify in a fresh subprocess (native addons can't be reloaded in-process)
    if (testNodePty(ptyDir)) {
      console.log('\x1b[32m[node-pty] ✓ Verified: rebuild works.\x1b[0m');
    } else {
      console.error('\x1b[31m[node-pty] ✗ Rebuild completed but binary still fails. Check node-gyp output above.\x1b[0m');
      process.exit(1);
    }
  } else {
    process.exit(1);
  }
}

main();
