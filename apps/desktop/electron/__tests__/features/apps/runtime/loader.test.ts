import os from 'os';
import path from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
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

  it('rejects non-JavaScript runtime entry extensions', async () => {
    await expect(loadAppRuntimeModule('/tmp/runtime-entry.ts')).rejects.toThrow(
      /Runtime entries must resolve to \.js, \.mjs, or \.cjs files/,
    );
  });
});
