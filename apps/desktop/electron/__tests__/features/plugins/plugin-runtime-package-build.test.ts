import { execFile as execFileCb } from 'child_process';
import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { afterEach, describe, expect, it } from 'vitest';

import { ensurePluginPackageReadyForInstall } from '@electron/features/plugins/package-build';

const execFile = promisify(execFileCb);
const desktopRoot = path.resolve(__dirname, '../../../..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const buildPluginScript = path.join(repoRoot, 'scripts', 'build-plugin.mjs');

const tempDirs: string[] = [];

async function createTempPluginDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-runtime-build-'));
  tempDirs.push(dir);
  return dir;
}

async function writePackageJson(dir: string, pkg: unknown): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('plugin runtime packaging and source preparation', () => {
  it('keeps declared runtimeExternals external when packaging runtime bundles', async () => {
    const dir = await createTempPluginDir();
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await mkdir(path.join(dir, 'node_modules', '@acme', 'nativeish'), { recursive: true });
    await writeFile(
      path.join(dir, 'node_modules', '@acme', 'nativeish', 'package.json'),
      JSON.stringify({
        name: '@acme/nativeish',
        version: '1.0.0',
        type: 'module',
        exports: './index.js',
      }, null, 2),
      'utf8',
    );
    await writeFile(
      path.join(dir, 'node_modules', '@acme', 'nativeish', 'index.js'),
      'export const nativeishValue = "NEEDS_EXTERNALIZATION";\n',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'runtime', 'index.ts'),
      'import { nativeishValue } from "@acme/nativeish"; export function createAppRuntime() { return { start() { return nativeishValue; }, handleStateChange() {}, dispose() {} }; }\n',
      'utf8',
    );
    await writePackageJson(dir, {
      name: '@acme/runtime-plugin',
      version: '1.0.0',
      dependencies: {
        '@acme/nativeish': '^1.0.0',
      },
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          stateFile: '.sero/apps/runtime-plugin/state.json',
          runtime: './runtime/index.ts',
          runtimeExternals: ['@acme/nativeish'],
        },
      },
      peerDependencies: {
        '@mariozechner/pi-coding-agent': '^0.0.0',
      },
    });

    await execFile(process.execPath, [buildPluginScript, dir], { cwd: repoRoot });

    const builtRuntime = await readFile(path.join(dir, 'dist', 'plugin', 'runtime', 'index.js'), 'utf8');
    expect(builtRuntime).toContain('@acme/nativeish');
    expect(builtRuntime).not.toContain('NEEDS_EXTERNALIZATION');
  });

  it.each([
    {
      label: 'runtime-only',
      setup: async (dir: string) => {
        await mkdir(path.join(dir, 'runtime'), { recursive: true });
        await writeFile(
          path.join(dir, 'runtime', 'index.ts'),
          'export function createAppRuntime() { return { start() {}, handleStateChange() {}, dispose() {} }; }\n',
          'utf8',
        );
      },
      pkg: {
        sero: {
          app: {
            id: 'runtime-plugin',
            name: 'Runtime Plugin',
            runtime: './runtime/index.ts',
          },
        },
      },
    },
    {
      label: 'extension-only',
      setup: async (dir: string) => {
        await mkdir(path.join(dir, 'extension'), { recursive: true });
        await writeFile(path.join(dir, 'extension', 'index.ts'), 'export default {};\n', 'utf8');
      },
      pkg: {
        pi: {
          extensions: ['./extension/index.ts'],
        },
        sero: {
          app: {
            id: 'extension-plugin',
            name: 'Extension Plugin',
          },
        },
      },
    },
  ])('skips dependency install for dependency-free headless $label source plugins', async ({ setup, pkg }) => {
    const dir = await createTempPluginDir();
    await setup(dir);
    await writePackageJson(dir, pkg);

    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    await ensurePluginPackageReadyForInstall(dir, 'local', {
      runCommand: async (command, args, cwd) => {
        calls.push({ command, args, cwd });
      },
    });

    expect(calls).toEqual([]);
  });

  it('installs dependencies for headless runtime source plugins that declare dependencies', async () => {
    const dir = await createTempPluginDir();
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(
      path.join(dir, 'runtime', 'index.ts'),
      'export function createAppRuntime() { return { start() {}, handleStateChange() {}, dispose() {} }; }\n',
      'utf8',
    );
    await writePackageJson(dir, {
      dependencies: {
        nanoid: '^5.0.0',
      },
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          runtime: './runtime/index.ts',
        },
      },
    });

    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    await ensurePluginPackageReadyForInstall(dir, 'local', {
      runCommand: async (command, args, cwd) => {
        calls.push({ command, args, cwd });
      },
    });

    expect(calls).toEqual([
      { command: 'npm', args: ['install'], cwd: dir },
    ]);
  });

  it('rejects headless runtime source plugins with workspace specs', async () => {
    const dir = await createTempPluginDir();
    await mkdir(path.join(dir, 'runtime'), { recursive: true });
    await writeFile(
      path.join(dir, 'runtime', 'index.ts'),
      'export function createAppRuntime() { return { start() {}, handleStateChange() {}, dispose() {} }; }\n',
      'utf8',
    );
    await writePackageJson(dir, {
      devDependencies: {
        '@sero-ai/common': 'workspace:*',
      },
      sero: {
        app: {
          id: 'runtime-plugin',
          name: 'Runtime Plugin',
          runtime: './runtime/index.ts',
        },
      },
    });

    await expect(
      ensurePluginPackageReadyForInstall(dir, 'local', {
        runCommand: async () => {
          throw new Error('install should not run for invalid workspace specs');
        },
      }),
    ).rejects.toThrow(/standalone npm-installable repo/);
  });
});
