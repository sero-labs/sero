/**
 * Verifies that scripts/sero-doctor.sh resolves symlinks before computing
 * the bundled Sero binary path.
 *
 * The test stages a fake `Sero.app/Contents/{Resources,MacOS}` layout in
 * a tempdir, copies the real shim into Resources, replaces the MacOS
 * "Sero" binary with a stub that prints its argv, and then invokes the
 * shim two ways:
 *   1. directly from Resources/  →  exec resolves to MacOS/Sero
 *   2. via a symlink in a sibling tempdir  →  exec must STILL resolve
 *      to MacOS/Sero (regression for the original `dirname $0` bug).
 */

import { execFileSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_SHIM = path.resolve(
  __dirname,
  '../../../../scripts/sero-doctor.sh',
);

let workdir: string;
let stagedShim: string;
let symlinkPath: string;
let exitMarker: string;

beforeAll(() => {
  workdir = mkdtempSync(path.join(tmpdir(), 'sero-doctor-shim-'));
  const contents = path.join(workdir, 'Sero.app', 'Contents');
  mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  mkdirSync(path.join(contents, 'MacOS'), { recursive: true });

  stagedShim = path.join(contents, 'Resources', 'sero-doctor');
  copyFileSync(REAL_SHIM, stagedShim);
  chmodSync(stagedShim, 0o755);

  // Stub the "Sero" binary: it just records its own absolute path and
  // every argv entry to a marker file the test will read back.
  exitMarker = path.join(workdir, 'argv.log');
  const stub = `#!/bin/sh\nprintf '%s\\n' "$0" "$@" > "${exitMarker}"\nexit 0\n`;
  const stubPath = path.join(contents, 'MacOS', 'Sero');
  writeFileSync(stubPath, stub);
  chmodSync(stubPath, 0o755);

  // Create the install-style symlink in a separate "bin" dir.
  const binDir = path.join(workdir, 'bin');
  mkdirSync(binDir);
  symlinkPath = path.join(binDir, 'sero-doctor');
  symlinkSync(stagedShim, symlinkPath);
});

afterAll(() => {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function runShim(target: string, args: string[]): string {
  execFileSync(target, args, { stdio: 'ignore' });
  return require('fs').readFileSync(exitMarker, 'utf8') as string;
}

function isStagedBinary(target: string): boolean {
  // The shim doesn't normalise away `Resources/..`, but the resolved
  // path must still point inside the staged Sero.app bundle.
  return (
    target.startsWith(workdir) &&
    target.includes('/Sero.app/Contents/') &&
    target.endsWith('/MacOS/Sero')
  );
}

describe('sero-doctor.sh', () => {
  it('execs MacOS/Sero with --doctor when invoked in-place', () => {
    const log = runShim(stagedShim, []);
    const lines = log.trim().split('\n');
    expect(isStagedBinary(lines[0])).toBe(true);
    expect(lines.slice(1)).toEqual(['--doctor']);
  });

  it('execs MacOS/Sero with --doctor when invoked via a symlink', () => {
    const log = runShim(symlinkPath, ['--quick', '--json']);
    const lines = log.trim().split('\n');
    // The exec target must still point at the real bundle, not at
    // /usr/local/MacOS/Sero or similar.
    expect(isStagedBinary(lines[0])).toBe(true);
    // Crucially, the path is NOT under the symlink's parent dir.
    expect(lines[0]).not.toContain('/bin/MacOS/Sero');
    expect(lines.slice(1)).toEqual(['--doctor', '--quick', '--json']);
  });
});
