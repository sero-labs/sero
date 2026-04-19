import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
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

  it('rejects unsupported runtime entry extensions', async () => {
    await expect(loadAppRuntimeModule('/tmp/runtime-entry.json')).rejects.toThrow(
      /Runtime entries must resolve to \.js, \.mjs, \.cjs, \.ts, \.mts, \.cts, or \.tsx files/,
    );
  });
});
