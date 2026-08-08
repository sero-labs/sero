import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHomeOverride = process.env.SERO_HOME_OVERRIDE;

async function writeApp(packageDir: string, workspaceCreation: unknown): Promise<void> {
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
    name: 'workspace-creation-plugin',
    version: '1.0.0',
    sero: {
      app: {
        id: 'workspace-creation',
        name: 'Workspace Creation',
        icon: 'box',
        stateFile: '.sero/apps/workspace-creation/state.json',
        workspaceCreation,
      },
      plugin: { category: 'utilities', tags: ['test'] },
    },
  }));
}

afterEach(() => {
  vi.resetModules();
  if (originalHomeOverride === undefined) delete process.env.SERO_HOME_OVERRIDE;
  else process.env.SERO_HOME_OVERRIDE = originalHomeOverride;
});

describe('workspace creation app contribution discovery', () => {
  it('parses a valid contribution', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-creation-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;
    const packageDir = path.join(tempRoot, 'plugin');

    try {
      await writeApp(packageDir, {
        label: 'Enable indexing',
        defaultEnabled: true,
        tool: 'enable_index',
        params: { mode: 'full' },
      });
      const { readAppManifestFromPackagePath } = await import('@electron/features/apps/discovery');

      const manifest = await readAppManifestFromPackagePath(packageDir);

      expect(manifest?.workspaceCreation).toEqual({
        label: 'Enable indexing',
        defaultEnabled: true,
        tool: 'enable_index',
        params: { mode: 'full' },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores a contribution without a label or tool', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-creation-invalid-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;
    const packageDir = path.join(tempRoot, 'plugin');

    try {
      await writeApp(packageDir, { defaultEnabled: true });
      const { readAppManifestFromPackagePath } = await import('@electron/features/apps/discovery');

      expect((await readAppManifestFromPackagePath(packageDir))?.workspaceCreation).toBeNull();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('omits params that are not an object', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-creation-params-'));
    process.env.SERO_HOME_OVERRIDE = tempRoot;
    const packageDir = path.join(tempRoot, 'plugin');

    try {
      await writeApp(packageDir, {
        label: 'Enable indexing',
        tool: 'enable_index',
        params: ['full'],
      });
      const { readAppManifestFromPackagePath } = await import('@electron/features/apps/discovery');

      expect((await readAppManifestFromPackagePath(packageDir))?.workspaceCreation).toEqual({
        label: 'Enable indexing',
        defaultEnabled: false,
        tool: 'enable_index',
        params: undefined,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
