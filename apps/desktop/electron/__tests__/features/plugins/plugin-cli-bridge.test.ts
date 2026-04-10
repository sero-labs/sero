import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { LoadExtensionsResult } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import {
  bridgeExtensionTools,
  clearPluginBridgePolicyCache,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';

function createLoadExtensionsResult(
  extensionPath: string,
  toolNames: string[],
): LoadExtensionsResult {
  return {
    extensions: [
      {
        path: extensionPath,
        resolvedPath: extensionPath,
        handlers: new Map(),
        tools: new Map(toolNames.map((name) => [
          name,
          {
            definition: {
              name,
              label: name,
              description: `${name} description`,
              parameters: Type.Object({}),
              execute: async () => ({
                content: [{ type: 'text', text: `${name} result` }],
                details: null,
              }),
            },
            extensionPath,
          },
        ])),
        messageRenderers: new Map(),
        commands: new Map(),
        flags: new Map(),
        shortcuts: new Map(),
      },
    ],
    errors: [],
    runtime: {} as LoadExtensionsResult['runtime'],
  };
}

describe('plugin CLI bridging', () => {
  let tmpDir = '';

  beforeEach(async () => {
    resetCliRegistryForTests();
    clearPluginBridgePolicyCache();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-cli-bridge-'));
  });

  afterEach(async () => {
    resetCliRegistryForTests();
    clearPluginBridgePolicyCache();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('bridges all plugin tools by default when sero.plugin.bridgeTools is omitted', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-all');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-all',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['plugin_all_default']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_all_default')).toBe(false);
    expect(getCliRegistry().get('plugin_all_default')).toBeTruthy();
  });

  it('bridges kanban when plugin manifest defaults to bridge all tools', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-kanban');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-kanban',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'productivity',
            tags: [],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['kanban']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('kanban')).toBe(false);
    expect(getCliRegistry().get('kanban')).toBeTruthy();
  });

  it('does not bridge plugin tools when sero.plugin.bridgeTools is false', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-none');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-none',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
            bridgeTools: false,
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['plugin_none_default']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_none_default')).toBe(true);
    expect(getCliRegistry().get('plugin_none_default')).toBeFalsy();
  });

  it('bridges only explicitly listed tool names when bridgeTools is an array', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-selective');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-selective',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
            bridgeTools: ['plugin_selective_keep'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, [
      'plugin_selective_keep',
      'plugin_selective_skip',
    ]);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_selective_keep')).toBe(false);
    expect(base.extensions[0]?.tools.has('plugin_selective_skip')).toBe(true);
    expect(getCliRegistry().get('plugin_selective_keep')).toBeTruthy();
    expect(getCliRegistry().get('plugin_selective_skip')).toBeFalsy();
  });
});
