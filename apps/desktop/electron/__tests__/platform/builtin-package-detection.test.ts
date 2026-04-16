import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { isBuiltinPackageDir } from '@electron/platform/protocols/builtin-package-detection.js';

const tempDirs: string[] = [];

function createPackageDir(packageJson: Record<string, unknown>, withExtensionDir = false): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sero-builtin-detect-'));
  tempDirs.push(tempDir);
  writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  if (withExtensionDir) {
    mkdirSync(path.join(tempDir, 'extension'));
  }
  return tempDir;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('builtin package detection', () => {
  it('accepts packages that declare Sero app metadata', () => {
    const dir = createPackageDir({ sero: { app: { id: 'demo', name: 'Demo' } } });
    expect(isBuiltinPackageDir(dir)).toBe(true);
  });

  it('accepts packages with extension folders even without manifest metadata', () => {
    const dir = createPackageDir({ name: 'legacy-extension' }, true);
    expect(isBuiltinPackageDir(dir)).toBe(true);
  });

  it('rejects plain packages without app or extension markers', () => {
    const dir = createPackageDir({ name: 'not-a-sero-package' });
    expect(isBuiltinPackageDir(dir)).toBe(false);
  });
});
