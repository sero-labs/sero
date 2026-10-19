import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSyntheticSourceInfo,
  defineTool,
  type LoadExtensionsResult,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  bridgeExtensionTools,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';
import {
  clearPluginBridgePolicyCache,
  hideUiOnlyTools,
  isUiOnlyTool,
} from '@electron/features/plugins/bridge-policy';

const ORCHESTRATOR_MANIFEST = path.resolve(
  __dirname,
  '../../../../../../plugins/sero-orchestrator-plugin/package.json',
);

function extensionWith(
  extensionPath: string,
  definitions: ToolDefinition[],
): LoadExtensionsResult {
  const sourceInfo = createSyntheticSourceInfo(extensionPath, { source: 'extension' });
  return {
    extensions: [{
      path: extensionPath,
      resolvedPath: extensionPath,
      sourceInfo,
      handlers: new Map(),
      tools: new Map(definitions.map((definition) => [definition.name, { definition, sourceInfo }])),
      messageRenderers: new Map(),
      commands: new Map(),
      flags: new Map(),
      shortcuts: new Map(),
    }],
    errors: [],
    runtime: {} as LoadExtensionsResult['runtime'],
  };
}

function plainTool(name: string, exposure?: ToolDefinition['exposure']): ToolDefinition {
  return defineTool({
    name,
    label: name,
    description: name,
    parameters: Type.Object({}),
    ...(exposure ? { exposure } : {}),
    execute: async () => ({ content: [{ type: 'text', text: name }], details: null }),
  });
}

describe('UI-only plugin tools', () => {
  let tmpDir = '';

  beforeEach(async () => {
    resetCliRegistryForTests();
    clearPluginBridgePolicyCache();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ui-only-tools-'));
  });

  afterEach(async () => {
    clearPluginBridgePolicyCache();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writePlugin(plugin: Record<string, unknown>): Promise<string> {
    const extensionPath = path.join(tmpDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'fixture', sero: { plugin } }),
      'utf8',
    );
    return extensionPath;
  }

  it('hides a declared tool without unregistering it', async () => {
    const extensionPath = await writePlugin({ uiOnlyTools: ['goals'] });
    const base = extensionWith(extensionPath, [plainTool('goals'), plainTool('goal')]);

    expect(isUiOnlyTool(extensionPath, 'goals')).toBe(true);
    expect(isUiOnlyTool(extensionPath, 'goal')).toBe(false);

    const hidden = hideUiOnlyTools(base);
    const tools = hidden.extensions[0]!.tools;

    // The UI bridge resolves the definition by name, so it has to stay registered.
    expect(tools.get('goals')?.definition.exposure).toBe('hidden');
    expect(tools.get('goal')?.definition.exposure).toBeUndefined();
  });

  it('keeps a UI-only tool out of the sero-cli surface the model reaches', async () => {
    const extensionPath = await writePlugin({ uiOnlyTools: ['goals'], bridgeTools: ['goal'] });
    const base = extensionWith(extensionPath, [plainTool('goals'), plainTool('goal')]);

    const bridged = bridgeExtensionTools(base, { registry: getCliRegistry() });
    const names = [...bridged.extensions[0]!.tools.keys()];

    // `goal` is the model's surface and still becomes a command. `goals` must not,
    // even though it stays registered for `appAgent.invokeTool`.
    expect(names).toEqual(['goals']);
    expect(getCliRegistry().get('goal')).toBeDefined();
    expect(getCliRegistry().get('goals')).toBeUndefined();
  });

  it('hides a declared tool even when the plugin forgets to set the exposure', async () => {
    const extensionPath = await writePlugin({ uiOnlyTools: ['goals'] });
    const base = extensionWith(extensionPath, [plainTool('goals')]);

    expect(base.extensions[0]!.tools.get('goals')?.definition.exposure).toBeUndefined();
    expect(
      hideUiOnlyTools(base).extensions[0]!.tools.get('goals')?.definition.exposure,
    ).toBe('hidden');
  });

  it('declares the Goals bridge as UI-only and no longer as a bridged tool', async () => {
    const manifest = JSON.parse(await readFile(ORCHESTRATOR_MANIFEST, 'utf8')) as {
      sero: { plugin: { bridgeTools: string[]; uiOnlyTools: string[] } };
    };

    // The model's Goal surface is `goal`. `goals` is the UI's bridge, and its
    // `set_limits` action counts as the user's own, so it must reach no model.
    expect(manifest.sero.plugin.uiOnlyTools).toContain('goals');
    expect(manifest.sero.plugin.bridgeTools).not.toContain('goals');
    expect(manifest.sero.plugin.bridgeTools).toContain('goal');
  });
});
