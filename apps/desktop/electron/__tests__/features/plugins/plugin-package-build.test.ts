import { execFile as execFileCb } from 'child_process';
import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensurePluginPackageReadyForInstall,
  findUnsupportedDependencySpec,
  pluginNeedsBuild,
  stripInstalledOnlyManifestFields,
} from '@electron/features/plugins/package-build';
import { NativeBuildToolsRequiredError } from '@electron/features/workspace/runtime/native-build/types';

async function createTempPluginDir(tempDirs: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-build-'));
  tempDirs.push(dir);
  return dir;
}

async function writePackageJson(dir: string, pkg: unknown): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

const execFile = promisify(execFileCb);
const desktopRoot = path.resolve(__dirname, '../../../..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const buildPluginScript = path.join(repoRoot, 'scripts', 'build-plugin.mjs');
const exportPluginSourceScript = path.join(repoRoot, 'scripts', 'export-plugin-source.mjs');
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
      dependencies: { 'typebox': 'catalog:' },
    })).toBe('dependencies.typebox=catalog:');

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
          runtime: './runtime/index.ts',
          devPort: 5174,
        },
      },
    });

    expect(result.sero?.app?.ui).toBe('./dist/ui/remoteEntry.js');
    expect(result.sero?.app?.runtime).toBe('./runtime/index.ts');
    expect(result.sero?.app).not.toHaveProperty('devPort');
  });

  it('builds pre-built plugin packages with compiled runtime entries', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(
      path.join(dir, 'runtime', 'index.ts'),
      'export function createAppRuntime() { return { async start() {}, async handleStateChange() {}, async dispose() {} }; }\n',
      'utf8',
    );
    await writePackageJson(dir, {
      name: '@acme/runtime-plugin',
      version: '1.0.0',
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          stateFile: '.sero/apps/runtime-plugin/state.json',
          runtime: './runtime/index.ts',
        },
      },
      peerDependencies: {
        '@mariozechner/pi-coding-agent': '^0.0.0',
      },
    });

    await execFile(process.execPath, [buildPluginScript, dir], { cwd: repoRoot });

    const builtPkg = JSON.parse(await readFile(path.join(dir, 'dist', 'plugin', 'package.json'), 'utf8')) as {
      files?: string[];
      sero?: { app?: { runtime?: string } };
    };

    expect(builtPkg.sero?.app?.runtime).toBe('./runtime/index.js');
    expect(builtPkg.files).toContain('runtime');
    await expect(stat(path.join(dir, 'dist', 'plugin', 'runtime', 'index.js'))).resolves.toBeDefined();
  });

  it('exports runtime source trees with npm-installable tsconfig rewrites', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(path.join(dir, 'runtime', 'index.ts'), 'export const runtime = true;\n', 'utf8');
    await writeFile(
      path.join(dir, 'runtime', 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['./**/*'] }, null, 2)}\n`,
      'utf8',
    );
    await writePackageJson(dir, {
      name: '@acme/runtime-plugin',
      version: '1.0.0',
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          stateFile: '.sero/apps/runtime-plugin/state.json',
          runtime: './runtime/index.ts',
        },
        plugin: {
          preBuilt: false,
        },
      },
    });

    await execFile(process.execPath, [exportPluginSourceScript, dir], { cwd: repoRoot });

    const exportedPkg = JSON.parse(await readFile(path.join(dir, 'dist', 'plugin-source', 'package.json'), 'utf8')) as {
      sero?: { app?: { runtime?: string } };
    };
    const runtimeTsconfig = JSON.parse(
      await readFile(path.join(dir, 'dist', 'plugin-source', 'runtime', 'tsconfig.json'), 'utf8'),
    ) as { extends?: string };

    expect(exportedPkg.sero?.app?.runtime).toBe('./runtime/index.ts');
    expect(runtimeTsconfig.extends).toBe('../tsconfig.extension.json');
    await expect(stat(path.join(dir, 'dist', 'plugin-source', 'runtime', 'index.ts'))).resolves.toBeDefined();
    await expect(stat(path.join(dir, 'dist', 'plugin-source', 'tsconfig.extension.json'))).resolves.toBeDefined();
  });

  it('preserves declared runtime source entries during install preparation', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(
      path.join(dir, 'runtime', 'index.ts'),
      'export function createAppRuntime() { return { start() {}, handleStateChange() {}, dispose() {} }; }\n',
      'utf8',
    );
    await writePackageJson(dir, {
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          runtime: './runtime/index.ts',
          devPort: 5174,
        },
      },
    });

    const runCommand = vi.fn(async () => {});

    await ensurePluginPackageReadyForInstall(dir, 'local', { runCommand });

    expect(runCommand).not.toHaveBeenCalled();

    const installedPkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
      sero?: { app?: { runtime?: string; devPort?: number } };
    };
    expect(installedPkg.sero?.app?.runtime).toBe('./runtime/index.ts');
    expect(installedPkg.sero?.app?.devPort).toBeUndefined();
  });

  it('rejects plugins that declare missing runtime entries', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          runtime: './runtime/index.ts',
        },
      },
    });

    const runCommand = vi.fn(async () => {});

    await expect(ensurePluginPackageReadyForInstall(dir, 'local', { runCommand })).rejects.toThrow(
      /declares runtime \.\/runtime\/index\.ts but the file is missing after install preparation/,
    );
    expect(runCommand).not.toHaveBeenCalled();
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

  it('reports native build metadata when source plugin dependency install needs compiler tools', async () => {
    const dir = await createTempPluginDir(tempDirs);
    await writePackageJson(dir, {
      scripts: {
        build: 'fake-build',
      },
      dependencies: {
        'native-addon': '^1.0.0',
      },
      sero: {
        app: {
          id: 'native-plugin',
          name: 'Native Plugin',
          runtime: './runtime/index.ts',
        },
      },
    });
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(path.join(dir, 'runtime', 'index.ts'), 'export {}\n', 'utf8');

    const runCommand = vi.fn(async () => {
      const error = new Error('gyp ERR! build error\nmake: command not found');
      Object.assign(error, { stderr: error.message, code: 1 });
      throw error;
    });

    try {
      await ensurePluginPackageReadyForInstall(dir, 'local', { runCommand });
      throw new Error('Expected native build tools error');
    } catch (error) {
      expect(error).toBeInstanceOf(NativeBuildToolsRequiredError);
      expect((error as NativeBuildToolsRequiredError).metadata).toMatchObject({
        code: 'NATIVE_BUILD_TOOLS_REQUIRED',
        seroInstallable: false,
        failure: { kind: 'missing-make' },
      });
    }
  });

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
