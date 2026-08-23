import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { resolvePrebuiltPluginPath } from '@electron/platform/protocols/e2e-prebuilt-plugins';

const manifest = JSON.stringify({ name: 'sero-test-plugin', sero: { app: { id: 'test' } } });

/** Plugin dir with a source file, and optionally a dist/plugin build. */
function makePlugin(options: { buildAgeSeconds?: number }): string {
  const pluginPath = mkdtempSync(path.join(tmpdir(), 'sero-plugin-'));
  mkdirSync(path.join(pluginPath, 'extension'), { recursive: true });
  writeFileSync(path.join(pluginPath, 'package.json'), manifest);
  writeFileSync(path.join(pluginPath, 'extension', 'index.ts'), 'export {};');

  if (options.buildAgeSeconds === undefined) return pluginPath;

  const builtPath = path.join(pluginPath, 'dist', 'plugin');
  mkdirSync(path.join(builtPath, 'extension'), { recursive: true });
  const builtManifest = path.join(builtPath, 'package.json');
  writeFileSync(builtManifest, manifest);

  const now = Date.now() / 1000;
  utimesSync(builtManifest, now, now - options.buildAgeSeconds);
  return pluginPath;
}

describe('prebuilt plugin resolution', () => {
  it('uses the build when it is newer than the source', () => {
    const pluginPath = makePlugin({ buildAgeSeconds: -60 });
    expect(resolvePrebuiltPluginPath(pluginPath)).toBe(path.join(pluginPath, 'dist', 'plugin'));
  });

  it('throws when the build is older than the source', () => {
    const pluginPath = makePlugin({ buildAgeSeconds: 60 });
    expect(() => resolvePrebuiltPluginPath(pluginPath)).toThrow(/older than its source/);
  });

  it('falls back to source for a plugin with no build', () => {
    const pluginPath = makePlugin({});
    expect(resolvePrebuiltPluginPath(pluginPath)).toBe(pluginPath);
  });
});
