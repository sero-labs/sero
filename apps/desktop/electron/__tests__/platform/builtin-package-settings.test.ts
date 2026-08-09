import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { SettingsPackageSource } from '@/types/ipc';
import { removeStaleBuiltinPackages } from '@electron/platform/protocols/builtin-package-settings';

let tempRoot = '';
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), 'sero-builtin-settings-'));
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  logSpy.mockRestore();
});

describe('built-in package settings cleanup', () => {
  it('keeps unrelated string entries', () => {
    const current = createPackage('workspace/plugins/sero-mcp-plugin', 'mcp');
    const custom = createPackage('custom/analytics-plugin', 'analytics');

    const result = removeStaleBuiltinPackages([custom], [current]);

    expect(result).toEqual({ packages: [custom], changed: false, removedSources: [] });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('keeps current built-in package entries in string and object form', () => {
    const current = createPackage('workspace/plugins/sero-mcp-plugin', 'mcp');
    const currentObject = { source: current, include: ['mcp'] } as unknown as SettingsPackageSource;

    const result = removeStaleBuiltinPackages([current, currentObject], [current]);

    expect(result.packages).toEqual([current, currentObject]);
    expect(result.changed).toBe(false);
  });

  it('removes stale bundled entries with the same app id and logs the removed source', () => {
    const current = createPackage('workspace/plugins/sero-mcp-plugin', 'mcp');
    const stale = createPackage('old/Sero.app/Contents/Resources/app.asar/dist/electron/builtin/plugins/sero-mcp-plugin', 'mcp');

    const result = removeStaleBuiltinPackages([stale, current], [current]);

    expect(result.packages).toEqual([current]);
    expect(result.changed).toBe(true);
    expect(result.removedSources).toEqual([stale]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(stale));
  });

  it('removes stale source checkout entries with the same built-in app id', () => {
    const current = createPackage('workspace/plugins/sero-graphify-plugin', 'graphify');
    const stale = createPackage('old-workspace/plugins/sero-graphify-plugin', 'graphify');

    const result = removeStaleBuiltinPackages([current, stale], [current]);

    expect(result.packages).toEqual([current]);
    expect(result.changed).toBe(true);
    expect(result.removedSources).toEqual([stale]);
  });

  it('keeps unreadable sources', () => {
    const current = createPackage('workspace/plugins/sero-mcp-plugin', 'mcp');
    const unreadable = path.join(tempRoot, 'dist/electron/builtin/plugins/broken-plugin');
    mkdirSync(unreadable, { recursive: true });
    writeFileSync(path.join(unreadable, 'package.json'), '{not json', 'utf8');

    const result = removeStaleBuiltinPackages([unreadable], [current]);

    expect(result).toEqual({ packages: [unreadable], changed: false, removedSources: [] });
  });
});

function createPackage(relativePath: string, appId: string): string {
  const packagePath = path.join(tempRoot, relativePath);
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(
    path.join(packagePath, 'package.json'),
    JSON.stringify({ sero: { app: { id: appId, name: appId } } }),
    'utf8',
  );
  return packagePath;
}
