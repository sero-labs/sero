import path from 'path';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { describe, expect, it } from 'vitest';

const desktopRoot = path.resolve(__dirname, '../../../..');
const webPluginRoot = path.join(desktopRoot, 'dist/electron/builtin/plugins/sero-web-plugin');
const webPluginNodeModules = path.join(webPluginRoot, 'node_modules');

const REQUIRED_RUNTIME_DEPENDENCIES = [
  '@mozilla/readability',
  'linkedom',
  'p-limit',
  'turndown',
  'unpdf',
  'better-sqlite3',
] as const;

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}

describe('built-in web plugin packaging', () => {
  it('stages the built-in web plugin with its runtime dependencies', async () => {
    // This packaging artifact only exists after the built-in web plugin has
    // been staged into the desktop build output tree. In a clean clone,
    // `pnpm test` should not require a prior `pnpm build`, so skip gracefully
    // when the staged package is absent.
    if (!existsSync(path.join(webPluginRoot, 'package.json'))) {
      if (process.env.SERO_REQUIRE_PACKAGED_PLUGINS === '1') {
        throw new Error('The staged built-in web plugin is missing from the desktop build.');
      }
      return;
    }

    const packageJson = await readJson(path.join(webPluginRoot, 'package.json'));
    const dependencies = packageJson.dependencies as Record<string, string> | undefined;

    expect(packageJson.name).toBe('@sero-ai/plugin-web');
    await expect(stat(path.join(webPluginRoot, 'dist/ui/remoteEntry.js'))).resolves.toBeDefined();
    for (const dependency of REQUIRED_RUNTIME_DEPENDENCIES) {
      expect(dependencies?.[dependency]).toBeTruthy();
      await expect(readJson(path.join(webPluginNodeModules, dependency, 'package.json')))
        .resolves.toMatchObject(expect.objectContaining({ name: dependency }));
    }
  });
});
