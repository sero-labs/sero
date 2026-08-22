import path from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import { isBuiltinPackageDir } from '@electron/platform/protocols/builtin-package-detection.js';

const desktopRoot = path.resolve(__dirname, '../../../..');
const repoRoot = path.resolve(desktopRoot, '../..');
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

interface BuiltinPackageManifest {
  name?: string;
  scripts?: { build?: string };
  sero?: { app?: { ui?: string } };
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}

function builtinUiBuildTasks(): string[] {
  const roots = [
    { dir: path.join(repoRoot, 'packages'), accepts: (name: string) => name.startsWith('pi-') },
    {
      dir: path.join(repoRoot, 'plugins'),
      accepts: (name: string) => name.startsWith('sero-') && name.endsWith('-plugin'),
    },
  ];

  return roots.flatMap(({ dir, accepts }) => readdirSync(dir)
    .filter(accepts)
    .map((name) => path.join(dir, name))
    .filter(isBuiltinPackageDir)
    .flatMap((packageDir) => {
      const manifest = JSON.parse(
        readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
      ) as BuiltinPackageManifest;
      return manifest.name && manifest.scripts?.build && manifest.sero?.app?.ui
        ? [`${manifest.name}#build`]
        : [];
    })).sort();
}

describe('built-in web plugin packaging', () => {
  it('orders every built-in UI build before the desktop build', async () => {
    const turbo = await readJson(path.join(repoRoot, 'turbo.json'));
    const tasks = turbo.tasks as Record<string, { dependsOn?: string[] }>;
    const dependencies = tasks['@sero/desktop#build']?.dependsOn
      ?.filter((dependency) => dependency !== '^build')
      .sort();

    expect(dependencies).toEqual(builtinUiBuildTasks());
  });

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
    await expect(stat(path.join(webPluginRoot, 'extension/index.ts'))).resolves.toBeDefined();
    for (const dependency of REQUIRED_RUNTIME_DEPENDENCIES) {
      expect(dependencies?.[dependency]).toBeTruthy();
      await expect(readJson(path.join(webPluginNodeModules, dependency, 'package.json')))
        .resolves.toMatchObject(expect.objectContaining({ name: dependency }));
    }
  });
});
