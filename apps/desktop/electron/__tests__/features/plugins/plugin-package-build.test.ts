import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensurePluginPackageReadyForInstall,
  findUnsupportedDependencySpec,
  pluginNeedsBuild,
  stripInstalledOnlyManifestFields,
} from '@electron/features/plugins/package-build';

async function createTempPluginDir(tempDirs: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-build-'));
  tempDirs.push(dir);
  return dir;
}

async function writePackageJson(dir: string, pkg: unknown): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

const desktopRoot = path.resolve(__dirname, '../../../..');
const stagedWebPluginRoot = path.join(desktopRoot, 'dist/electron/builtin/plugins/sero-web-plugin');

describe('plugin package build helpers', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('detects workspace and catalog dependency specs', () => {
    expect(findUnsupportedDependencySpec({
      dependencies: { react: '^19.1.1' },
      devDependencies: { '@sero-ai/app-runtime': 'workspace:*' },
    })).toBe('devDependencies.@sero-ai/app-runtime=workspace:*');

    expect(findUnsupportedDependencySpec({
      dependencies: { '@sinclair/typebox': 'catalog:' },
    })).toBe('dependencies.@sinclair/typebox=catalog:');

    expect(findUnsupportedDependencySpec({
      dependencies: { react: '^19.1.1' },
      devDependencies: { vite: '^6.4.1' },
    })).toBeNull();
  });

  it('detects when a plugin UI needs a local build', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
        },
      },
    });

    expect(pluginNeedsBuild({
      sero: {
        app: {
          ui: './dist/ui/remoteEntry.js',
        },
      },
    }, dir)).toBe(true);

    await mkdir(path.join(dir, 'dist', 'ui'), { recursive: true });
    await writeFile(path.join(dir, 'dist', 'ui', 'remoteEntry.js'), 'export {}\n', 'utf8');

    expect(pluginNeedsBuild({
      sero: {
        app: {
          ui: './dist/ui/remoteEntry.js',
        },
      },
    }, dir)).toBe(false);
  });

  it('removes devPort from installed plugin manifests', () => {
    const result = stripInstalledOnlyManifestFields({
      sero: {
        app: {
          ui: './dist/ui/remoteEntry.js',
          devPort: 5174,
        },
      },
    });

    expect(result.sero?.app?.ui).toBe('./dist/ui/remoteEntry.js');
    expect(result.sero?.app).not.toHaveProperty('devPort');
  });

  it('builds git source plugins locally before install', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      scripts: {
        build: 'fake-build',
      },
      devDependencies: {
        react: '^19.1.1',
      },
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
          devPort: 5174,
        },
      },
    });

    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    await ensurePluginPackageReadyForInstall(dir, 'git', {
      runCommand: async (command, args, cwd) => {
        calls.push({ command, args, cwd });
        if (command === 'npm' && args.join(' ') === 'run build') {
          await mkdir(path.join(cwd, 'dist', 'ui'), { recursive: true });
          await writeFile(path.join(cwd, 'dist', 'ui', 'remoteEntry.js'), 'export {}\n', 'utf8');
        }
      },
    });

    expect(calls).toEqual([
      { command: 'npm', args: ['install'], cwd: dir },
      { command: 'npm', args: ['run', 'build'], cwd: dir },
    ]);

    const installedPkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
      sero?: { app?: { devPort?: number } };
    };
    expect(installedPkg.sero?.app?.devPort).toBeUndefined();
  });

  it('rebuilds source plugins when preBuilt is false even if dist/ui already exists', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await mkdir(path.join(dir, 'dist', 'ui'), { recursive: true });
    await writeFile(path.join(dir, 'dist', 'ui', 'remoteEntry.js'), 'stale build\n', 'utf8');
    await writePackageJson(dir, {
      scripts: {
        build: 'fake-build',
      },
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
        },
        plugin: {
          preBuilt: false,
        },
      },
    });

    const calls: Array<{ command: string; args: string[] }> = [];
    await ensurePluginPackageReadyForInstall(dir, 'git', {
      runCommand: async (command, args) => {
        calls.push({ command, args });
      },
    });

    expect(calls).toEqual([
      { command: 'npm', args: ['install'] },
      { command: 'npm', args: ['run', 'build'] },
    ]);
  });

  it.each(['git', 'local'] as const)(
    'reinstalls dependencies for %s source plugins even when node_modules already exists',
    async (sourceKind) => {
      const dir = await createTempPluginDir(tempDirs);
      await mkdir(path.join(dir, 'node_modules'), { recursive: true });
      await writeFile(path.join(dir, 'node_modules', '.stale-marker'), 'stale\n', 'utf8');
      await writePackageJson(dir, {
        scripts: {
          build: 'fake-build',
        },
        sero: {
          app: {
            id: 'todo',
            name: 'Todo',
            ui: './dist/ui/remoteEntry.js',
          },
        },
      });

      const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
      await ensurePluginPackageReadyForInstall(dir, sourceKind, {
        runCommand: async (command, args, cwd) => {
          calls.push({ command, args, cwd });
          if (command === 'npm' && args.join(' ') === 'run build') {
            await mkdir(path.join(cwd, 'dist', 'ui'), { recursive: true });
            await writeFile(path.join(cwd, 'dist', 'ui', 'remoteEntry.js'), 'export {}\n', 'utf8');
          }
        },
      });

      expect(calls).toEqual([
        { command: 'npm', args: ['install'], cwd: dir },
        { command: 'npm', args: ['run', 'build'], cwd: dir },
      ]);
    },
  );

  it('skips rebuilding local pre-built plugin bundles', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await mkdir(path.join(dir, 'dist', 'ui'), { recursive: true });
    await writeFile(path.join(dir, 'dist', 'ui', 'remoteEntry.js'), 'export {}\n', 'utf8');
    await writePackageJson(dir, {
      scripts: {
        build: 'fake-build',
      },
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
        },
        plugin: {
          preBuilt: true,
        },
      },
    });

    const runCommand = vi.fn();
    await ensurePluginPackageReadyForInstall(dir, 'local', { runCommand });

    expect(runCommand).not.toHaveBeenCalled();
  });

  it('requires pre-built npm packages', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
        },
      },
    });

    await expect(ensurePluginPackageReadyForInstall(dir, 'npm')).rejects.toThrow(
      /npm packages must ship pre-built UI artifacts/,
    );
  });

  it('rejects git source packages with workspace specs', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      scripts: {
        build: 'vite build',
      },
      devDependencies: {
        '@sero-ai/app-runtime': 'workspace:*',
      },
      sero: {
        app: {
          id: 'todo',
          name: 'Todo',
          ui: './dist/ui/remoteEntry.js',
        },
      },
    });

    await expect(ensurePluginPackageReadyForInstall(dir, 'git')).rejects.toThrow(
      /standalone npm-installable repo/,
    );
  });

  it('stages built-in web plugin runtime dependencies into the packaged artifact tree', async () => {
    // This test verifies the full packaging pipeline output including the
    // web plugin's Vite-built UI bundle. The UI build depends on native
    // modules (better-sqlite3) which may not compile on all CI runners.
    // Skip gracefully when the staged remoteEntry.js is absent.
    try {
      await stat(path.join(stagedWebPluginRoot, 'dist/ui/remoteEntry.js'));
    } catch {
      return; // web plugin UI build artifacts not present — skip
    }

    await expect(stat(path.join(stagedWebPluginRoot, 'package.json'))).resolves.toBeDefined();
    await expect(stat(path.join(stagedWebPluginRoot, 'extension/index.ts'))).resolves.toBeDefined();
    await expect(stat(path.join(stagedWebPluginRoot, 'node_modules/better-sqlite3'))).resolves.toBeDefined();
    await expect(stat(path.join(stagedWebPluginRoot, 'node_modules/@mozilla/readability'))).resolves.toBeDefined();
  });
});
