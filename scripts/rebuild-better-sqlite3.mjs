#!/usr/bin/env node
/**
 * Ensures better-sqlite3's native binary matches the Electron ABI.
 *
 * WHY THIS EXISTS:
 * Sero runs in Electron, which bundles its own Node.js with a specific module ABI.
 * better-sqlite3 is a native addon used by @tobilu/qmd (the memory search backend).
 * A plain `npm rebuild` or `pnpm rebuild` compiles against system Node.js (wrong ABI),
 * producing ERR_DLOPEN_FAILED at runtime and silently disabling memory search.
 *
 * WHAT THIS DOES:
 * 1. Locates better-sqlite3 in the pnpm store
 * 2. Locates the Electron binary in node_modules
 * 3. Runs a trivial smoke test via ELECTRON_RUN_AS_NODE=1 (tests the actual ABI)
 * 4. If it fails → runs @electron/rebuild to compile against Electron's headers
 * 5. If it works → exits immediately (no-op, fast)
 *
 * Called from root package.json `postinstall`.
 */

import { execSync, execFileSync, spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const req = createRequire(import.meta.url);

// ── Locate better-sqlite3 ─────────────────────────────────────────────────────

const PNPM_STORE = resolve(ROOT, 'node_modules/.pnpm');

function findBetterSqlite3() {
  if (!existsSync(PNPM_STORE)) return null;
  const entries = readdirSync(PNPM_STORE).filter(e => e.startsWith('better-sqlite3@'));
  if (entries.length === 0) return null;
  // Take the first (there should only be one version)
  const pkgDir = resolve(PNPM_STORE, entries[0], 'node_modules/better-sqlite3');
  return existsSync(pkgDir) ? pkgDir : null;
}

// ── Locate Electron binary ────────────────────────────────────────────────────

function findElectronBinary() {
  if (!existsSync(PNPM_STORE)) return null;
  const entries = readdirSync(PNPM_STORE).filter(e => e.startsWith('electron@'));
  for (const entry of entries) {
    const bin = resolve(PNPM_STORE, entry, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
    if (existsSync(bin)) return bin;
  }
  return null;
}

function findElectronVersion() {
  const entries = existsSync(PNPM_STORE)
    ? readdirSync(PNPM_STORE).filter(e => e.startsWith('electron@'))
    : [];
  for (const entry of entries) {
    const pkgJson = resolve(PNPM_STORE, entry, 'node_modules/electron/package.json');
    if (existsSync(pkgJson)) {
      try {
        const { version } = req(pkgJson);
        // Strip build metadata (e.g. "33.4.11+wvcus" → "33.4.11")
        return version.split('+')[0];
      } catch { /* continue */ }
    }
  }
  return null;
}

// ── Smoke test via Electron runtime ───────────────────────────────────────────

function testWithElectron(electronBin, sqlite3Dir) {
  const script = `
    try {
      const bs3 = require(${JSON.stringify(sqlite3Dir)});
      const db = new bs3(':memory:');
      db.exec('CREATE TABLE t (x INTEGER)');
      db.prepare('INSERT INTO t VALUES (?)').run(42);
      const row = db.prepare('SELECT x FROM t').get();
      process.exit(row && row.x === 42 ? 0 : 1);
    } catch (e) {
      process.stderr.write('better-sqlite3 test failed: ' + e.message + '\\n');
      process.exit(1);
    }
  `;

  const result = spawnSync(electronBin, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 15_000,
    stdio: 'pipe',
  });

  return result.status === 0;
}

// ── Rebuild via @electron/rebuild ─────────────────────────────────────────────

function rebuild(sqlite3Dir, electronVersion) {
  console.log(`\x1b[33m  → Rebuilding better-sqlite3 for Electron ${electronVersion}...\x1b[0m`);
  try {
    execSync(
      `npx @electron/rebuild --version "${electronVersion}" --module-dir "${sqlite3Dir}" --which-module better-sqlite3`,
      { stdio: 'inherit', cwd: ROOT, timeout: 180_000 },
    );
    console.log('\x1b[32m  ✓ better-sqlite3 rebuilt successfully.\x1b[0m');
    return true;
  } catch {
    console.error('\x1b[31m  ✗ better-sqlite3 rebuild failed. Memory search (QMD) will not work.\x1b[0m');
    console.error(`    Run manually: npx @electron/rebuild --version "${electronVersion}" --module-dir "${sqlite3Dir}" --which-module better-sqlite3`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('[better-sqlite3] Checking native binary for Electron...');

  const sqlite3Dir = findBetterSqlite3();
  if (!sqlite3Dir) {
    console.log('[better-sqlite3] Not found in pnpm store — skipping.');
    process.exit(0);
  }

  const electronBin = findElectronBinary();
  if (!electronBin) {
    console.log('[better-sqlite3] Electron binary not found — skipping (install apps/desktop first).');
    process.exit(0);
  }

  const electronVersion = findElectronVersion();
  if (!electronVersion) {
    console.log('[better-sqlite3] Could not determine Electron version — skipping.');
    process.exit(0);
  }

  if (testWithElectron(electronBin, sqlite3Dir)) {
    console.log(`\x1b[32m[better-sqlite3] ✓ Binary works with Electron ${electronVersion}.\x1b[0m`);
    process.exit(0);
  }

  console.log(`\x1b[33m[better-sqlite3] ✗ Binary does not work with Electron ${electronVersion}.\x1b[0m`);

  const ok = rebuild(sqlite3Dir, electronVersion);
  if (!ok) {
    process.exit(1);
  }

  // Verify in a fresh process after rebuild
  if (testWithElectron(electronBin, sqlite3Dir)) {
    console.log('\x1b[32m[better-sqlite3] ✓ Verified: rebuild works.\x1b[0m');
  } else {
    console.error('\x1b[31m[better-sqlite3] ✗ Rebuild completed but binary still fails. Check output above.\x1b[0m');
    process.exit(1);
  }
}

main();
