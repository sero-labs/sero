import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppRuntimeModule } from '@electron/features/apps/runtime/loader';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-app-runtime-loader-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('loadAppRuntimeModule', () => {
  it('loads named createAppRuntime exports from JavaScript runtime entries', async () => {
    const dir = await createTempDir();
    const runtimePath = path.join(dir, 'runtime.mjs');
    await writeFile(
      runtimePath,
      'export function createAppRuntime() { return { start() {}, handleStateChange() {}, dispose() {} }; }\n',
      'utf8',
    );

    const runtimeModule = await loadAppRuntimeModule(runtimePath);

    expect(typeof runtimeModule.createAppRuntime).toBe('function');
  });

  it('loads TypeScript runtime entries with bundled relative imports', async () => {
    const dir = await createTempDir();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/runtime-loader-test', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(
      path.join(dir, 'runtime-helper.ts'),
      'export const runtimeValue = "ts-runtime";\n',
      'utf8',
    );
    const runtimePath = path.join(dir, 'runtime.ts');
    await writeFile(
      runtimePath,
      [
        'import { runtimeValue } from "./runtime-helper.ts";',
        'export default {',
        '  createAppRuntime() {',
        '    return {',
        '      start() { return runtimeValue; },',
        '      handleStateChange() {},',
        '      dispose() {},',
        '    };',
        '  },',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    const runtimeModule = await loadAppRuntimeModule(runtimePath);

    expect(typeof runtimeModule.createAppRuntime).toBe('function');
  });

  it('loads TypeScript runtime entries that depend on packages exporting TypeScript source', async () => {
    const dir = await createTempDir();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/runtime-loader-test', version: '1.0.0' }, null, 2),
      'utf8',
    );

    const packageDir = path.join(dir, 'node_modules', '@acme', 'shared-ts');
    await mkdir(path.join(packageDir, 'src'), { recursive: true });
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@acme/shared-ts',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': './src/index.ts',
        },
      }, null, 2),
      'utf8',
    );
    await writeFile(
      path.join(packageDir, 'src', 'index.ts'),
      'export const sharedRuntimeValue: string = "ts-export-package";\n',
      'utf8',
    );

    const runtimePath = path.join(dir, 'runtime.ts');
    await writeFile(
      runtimePath,
      [
        'import { sharedRuntimeValue } from "@acme/shared-ts";',
        'export function createAppRuntime() {',
        '  return {',
        '    start() { return sharedRuntimeValue; },',
        '    handleStateChange() {},',
        '    dispose() {},',
        '  };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const runtimeModule = await loadAppRuntimeModule(runtimePath);
    const runtime = await runtimeModule.createAppRuntime({} as never);

    expect(runtime.start()).toBe('ts-export-package');
  });

  it('reuses the same transpiled runtime bundle without rebuilding when unchanged', async () => {
    const dir = await createTempDir();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/runtime-loader-test', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(path.join(dir, 'runtime-helper.ts'), 'export const runtimeValue = "cached-runtime";\n', 'utf8');
    const runtimePath = path.join(dir, 'runtime.ts');
    await writeFile(
      runtimePath,
      [
        'import { runtimeValue } from "./runtime-helper.ts";',
        'export function createAppRuntime() {',
        '  return {',
        '    start() { return runtimeValue; },',
        '    handleStateChange() {},',
        '    dispose() {},',
        '  };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const firstModule = await loadAppRuntimeModule(runtimePath);
    const firstRuntime = await firstModule.createAppRuntime({} as never);
    expect(firstRuntime.start()).toBe('cached-runtime');

    const cacheDir = path.join(dir, 'node_modules', '.cache', 'sero-runtime-loader');
    const firstBundles = (await readdir(cacheDir)).filter((entry) => entry.endsWith('.mjs'));
    expect(firstBundles).toHaveLength(1);
    const firstBundlePath = path.join(cacheDir, firstBundles[0]!);
    const firstBundleStat = await stat(firstBundlePath);

    await wait(30);

    const secondModule = await loadAppRuntimeModule(runtimePath);
    const secondRuntime = await secondModule.createAppRuntime({} as never);
    expect(secondRuntime.start()).toBe('cached-runtime');

    const secondBundles = (await readdir(cacheDir)).filter((entry) => entry.endsWith('.mjs'));
    expect(secondBundles).toEqual(firstBundles);
    expect(secondModule.createAppRuntime).toBe(firstModule.createAppRuntime);

    const secondBundleStat = await stat(firstBundlePath);
    expect(secondBundleStat.mtimeMs).toBe(firstBundleStat.mtimeMs);
  });

  it('leaves declared runtime externals out of the transpiled bundle', async () => {
    const dir = await createTempDir();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/runtime-loader-test', version: '1.0.0' }, null, 2),
      'utf8',
    );
    const packageDir = path.join(dir, 'node_modules', '@acme', 'nativeish');
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@acme/nativeish',
        version: '1.0.0',
        type: 'module',
        exports: './index.js',
      }, null, 2),
      'utf8',
    );
    await writeFile(path.join(packageDir, 'index.js'), 'export const nativeishValue = "external-runtime";\n', 'utf8');
    const runtimePath = path.join(dir, 'runtime.ts');
    await writeFile(
      runtimePath,
      [
        'import { nativeishValue } from "@acme/nativeish";',
        'export function createAppRuntime() {',
        '  return {',
        '    start() { return nativeishValue; },',
        '    handleStateChange() {},',
        '    dispose() {},',
        '  };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const runtimeModule = await loadAppRuntimeModule(runtimePath, { externals: ['@acme/nativeish'] });
    const runtime = await runtimeModule.createAppRuntime({} as never);
    expect(runtime.start()).toBe('external-runtime');

    const cacheDir = path.join(dir, 'node_modules', '.cache', 'sero-runtime-loader');
    const bundles = (await readdir(cacheDir)).filter((entry) => entry.endsWith('.mjs'));
    expect(bundles).toHaveLength(1);

    const bundleSource = await readFile(path.join(cacheDir, bundles[0]!), 'utf8');
    expect(bundleSource).toContain('@acme/nativeish');
  });

  it('writes a new transpiled runtime bundle when an input changes', async () => {
    const dir = await createTempDir();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/runtime-loader-test', version: '1.0.0' }, null, 2),
      'utf8',
    );
    const helperPath = path.join(dir, 'runtime-helper.ts');
    await writeFile(helperPath, 'export const runtimeValue = "before-change";\n', 'utf8');
    const runtimePath = path.join(dir, 'runtime.ts');
    await writeFile(
      runtimePath,
      [
        'import { runtimeValue } from "./runtime-helper.ts";',
        'export function createAppRuntime() {',
        '  return {',
        '    start() { return runtimeValue; },',
        '    handleStateChange() {},',
        '    dispose() {},',
        '  };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const firstModule = await loadAppRuntimeModule(runtimePath);
    const firstRuntime = await firstModule.createAppRuntime({} as never);
    expect(firstRuntime.start()).toBe('before-change');

    const cacheDir = path.join(dir, 'node_modules', '.cache', 'sero-runtime-loader');
    const firstBundles = (await readdir(cacheDir)).filter((entry) => entry.endsWith('.mjs'));
    expect(firstBundles).toHaveLength(1);

    await wait(30);
    await writeFile(helperPath, 'export const runtimeValue = "after-change";\n', 'utf8');

    const secondModule = await loadAppRuntimeModule(runtimePath);
    const secondRuntime = await secondModule.createAppRuntime({} as never);
    expect(secondRuntime.start()).toBe('after-change');

    const secondBundles = (await readdir(cacheDir)).filter((entry) => entry.endsWith('.mjs')).sort();
    expect(secondBundles).toHaveLength(2);
    expect(secondBundles).not.toEqual(firstBundles);
    expect(secondModule.createAppRuntime).not.toBe(firstModule.createAppRuntime);
  });

  it('rejects unsupported runtime entry extensions', async () => {
    await expect(loadAppRuntimeModule('/tmp/runtime-entry.json')).rejects.toThrow(
      /Runtime entries must resolve to \.js, \.mjs, \.cjs, \.ts, \.mts, \.cts, or \.tsx files/,
    );
  });
});
