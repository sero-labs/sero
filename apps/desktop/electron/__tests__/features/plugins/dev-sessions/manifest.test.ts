import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPluginDevServerResultToManifest,
  readPluginDevSourceManifest,
  validatePluginDevSourceManifest,
} from '@electron/features/plugins/dev-sessions/manifest';

const tempRoots: string[] = [];

async function createPluginSource(
  appId = 'dev-plugin',
  name = 'Dev Plugin',
  options: {
    component?: string | null;
    ui?: string | null;
    includeBuiltUi?: boolean;
  } = {},
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-dev-manifest-'));
  tempRoots.push(tempRoot);

  await mkdir(tempRoot, { recursive: true });
  await writeFile(
    path.join(tempRoot, 'package.json'),
    JSON.stringify({
      name: `@sero/${appId}`,
      version: '1.0.0',
      scripts: {
        dev: 'vite',
      },
      sero: {
        app: {
          id: appId,
          name,
          icon: 'box',
          stateFile: `.sero/apps/${appId}/state.json`,
          component: options.component === undefined ? 'DevPluginApp' : options.component,
          ui: options.ui === undefined ? './dist/ui/remoteEntry.js' : options.ui,
          devPort: 5193,
        },
      },
    }, null, 2),
  );

  if (options.includeBuiltUi !== false) {
    await mkdir(path.join(tempRoot, 'dist', 'ui'), { recursive: true });
    await writeFile(path.join(tempRoot, 'dist', 'ui', 'mf-manifest.json'), '{"metaData":{}}');
  }

  return tempRoot;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('plugin dev manifest validation', () => {
  it('reads declared dev metadata from a valid local plugin source tree', async () => {
    const sourcePath = await createPluginSource();

    const result = await readPluginDevSourceManifest(sourcePath);

    expect(result.sourcePath).toBe(sourcePath);
    expect(result.manifest.id).toBe('dev-plugin');
    expect(result.declaredDevPort).toBe(5193);
    expect(result.devCommand).toBe('npm run dev');
    expect(result.hasDeclaredUi).toBe(true);
    expect(result.hasBuiltUi).toBe(true);
    expect(result.manifest.devPort).toBe(5193);
  });

  it('rejects app id drift against the persisted expected app id', async () => {
    const sourcePath = await createPluginSource('renamed-plugin', 'Renamed Plugin');

    await expect(validatePluginDevSourceManifest(sourcePath, {
      expectedAppId: 'old-plugin',
    })).rejects.toThrow(/app id drifted from "old-plugin" to "renamed-plugin"/);
  });

  it('suppresses UI fields when the resolved session mode has no usable UI', async () => {
    const sourcePath = await createPluginSource();
    const manifest = (await readPluginDevSourceManifest(sourcePath)).manifest;

    expect(applyPluginDevServerResultToManifest(manifest, {
      remoteEntryOverride: null,
      uiMode: 'unavailable',
      error: 'missing build',
    })).toEqual(expect.objectContaining({
      component: null,
      uiEntry: null,
      devPort: undefined,
      remoteEntryOverride: null,
    }));
  });

  it('clears legacy devPort fallback metadata when a session uses built UI fallback', async () => {
    const sourcePath = await createPluginSource();
    const manifest = (await readPluginDevSourceManifest(sourcePath)).manifest;

    expect(applyPluginDevServerResultToManifest(manifest, {
      remoteEntryOverride: null,
      uiMode: 'built-fallback',
      error: 'dev server unreachable',
    })).toEqual(expect.objectContaining({
      component: 'DevPluginApp',
      uiEntry: expect.stringContaining('/dist/ui/remoteEntry.js'),
      devPort: undefined,
      remoteEntryOverride: null,
    }));
  });

  it('rejects folders without a valid sero.app manifest', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-dev-manifest-invalid-'));
    tempRoots.push(tempRoot);

    await writeFile(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ name: '@sero/invalid', version: '1.0.0' }, null, 2),
    );

    await expect(readPluginDevSourceManifest(tempRoot)).rejects.toThrow(/must define sero\.app\.id and sero\.app\.name/);
  });

  it('detects backend-only sources without declared UI or built assets', async () => {
    const sourcePath = await createPluginSource('backend-only-plugin', 'Backend Only Plugin', {
      component: null,
      ui: null,
      includeBuiltUi: false,
    });

    const result = await readPluginDevSourceManifest(sourcePath);
    expect(result.hasDeclaredUi).toBe(false);
    expect(result.hasBuiltUi).toBe(false);
  });
});
