import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import { resolvePluginStagingEntries } from '../../../../scripts/stage-plugin-dependencies.mjs';

const desktopRoot = path.resolve(__dirname, '../../../..');
const repoRoot = path.resolve(desktopRoot, '../..');
const pluginSource = path.join(repoRoot, 'plugins/sero-fff-plugin');
const stagedPlugin = path.join(desktopRoot, 'dist/electron/builtin/plugins/sero-fff-plugin');

/** Native pieces that must reach the packaged app for the engine to load. */
const NATIVE_PACKAGES = ['@ff-labs/fff-node', 'ffi-rs'] as const;

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}

describe('built-in FFF search plugin packaging', () => {
  it('keeps the native engine out of the extension bundle', async () => {
    const manifest = await readJson(path.join(pluginSource, 'package.json'));
    const plugin = (manifest.sero as { plugin: Record<string, unknown> }).plugin;

    expect(plugin.bundleExtensions).toBe(true);
    expect(plugin.extensionExternals).toContain('@ff-labs/fff-node');
  });

  it('keeps the search tools on the agent rather than bridging them to the CLI', async () => {
    const manifest = await readJson(path.join(pluginSource, 'package.json'));
    const plugin = (manifest.sero as { plugin: Record<string, unknown> }).plugin;

    // Bridging removes a tool from the agent's tool list (see cli/index.ts), so
    // `find`/`grep`/`multi_grep` would become `sero find ...` and nothing else.
    expect(plugin.bridgeTools).toBe(false);
  });

  it('resolves the native engine and its loader into a flat staging set', () => {
    const pluginNodeModules = path.join(pluginSource, 'node_modules');
    if (!existsSync(path.join(pluginNodeModules, '@ff-labs/fff-node'))) return;

    const names = resolvePluginStagingEntries(pluginNodeModules, ['@ff-labs/fff-node'])
      .map((entry) => entry.name);

    for (const packageName of NATIVE_PACKAGES) expect(names).toContain(packageName);
    // The platform binary package the engine dlopens, whichever host this runs on.
    expect(names.some((name) => name.startsWith('@ff-labs/fff-bin-'))).toBe(true);
  });

  it('unpacks every native path the staged plugin can hold', async () => {
    const builderConfig = await readFile(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');

    for (const scope of ['@ff-labs', '@yuuang', 'ffi-rs']) {
      expect(builderConfig).toContain(
        `dist/electron/builtin/plugins/sero-fff-plugin/node_modules/${scope}/**/*`,
      );
    }
  });

  it('stages the plugin with its native dependencies', async () => {
    // Only present after a desktop build has staged the built-in plugins.
    if (!existsSync(path.join(stagedPlugin, 'package.json'))) {
      if (process.env.SERO_REQUIRE_PACKAGED_PLUGINS === '1') {
        throw new Error('The staged built-in FFF plugin is missing from the desktop build.');
      }
      return;
    }

    const packageJson = await readJson(path.join(stagedPlugin, 'package.json'));
    expect(packageJson.name).toBe('@sero-ai/plugin-fff');
    expect(existsSync(path.join(stagedPlugin, 'extension/index.js'))).toBe(true);

    for (const packageName of NATIVE_PACKAGES) {
      await expect(readJson(path.join(stagedPlugin, 'node_modules', packageName, 'package.json')))
        .resolves.toMatchObject(expect.objectContaining({ name: packageName }));
    }
  });
});
