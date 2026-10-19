/**
 * Every tool and action an agent session can be given, read from the code.
 *
 * Plugins are loaded at run time, not imported: a static import of plugin
 * source pulls the plugin into the desktop type check.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { registerCoreCommands } from '@electron/cli/commands/core';
import { CliRegistry } from '@electron/cli/core/registry';
import { createSeroCodemodeExtension } from '@electron/features/codemode';
import { createRuntimeTools } from '@electron/features/container/tools/tools';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { registerCreateAgentTool, registerSubagentTool } from '@electron/features/subagent/extensions/tool';
import type { SubagentManager } from '@electron/features/subagent';
import { createSeroToolSearchExtension } from '@electron/features/tool-loadout';
import type { InventoryEntry } from '../../../e2e/helpers/tool-check/types';

export const PLUGINS_DIR = path.resolve(__dirname, '../../../../../plugins');

interface RecordedTool {
  name: string;
  parameters?: unknown;
}

/**
 * A tool's actions: the values of its `action` parameter, from a `StringEnum`
 * (`enum`) or a union of literals (`anyOf` of `const`). Null when the tool
 * has no `action` parameter.
 */
export function actionsOf(parameters: unknown): string[] | null {
  const action = (parameters as { properties?: Record<string, unknown> } | undefined)?.properties?.action;
  if (action === undefined) return null;
  const schema = action as { enum?: unknown[]; anyOf?: Array<{ const?: unknown }> };
  const values = schema.enum ?? schema.anyOf?.map((option) => option.const);
  if (!values?.length || values.some((value) => typeof value !== 'string')) {
    throw new Error('An `action` parameter must list its values as an enum or a union of literals');
  }
  return values as string[];
}

/** An ExtensionAPI that records `registerTool` and answers every other call with nothing. */
function recordingApi(tools: RecordedTool[]): ExtensionAPI {
  const nothing: unknown = new Proxy(() => undefined, {
    get: (_target, prop) => (prop === 'then' ? undefined : nothing),
    apply: () => undefined,
  });
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'registerTool') return (tool: RecordedTool) => tools.push(tool);
      if (prop === 'getActiveTools' || prop === 'getAllTools' || prop === 'getCommands') return () => [];
      if (prop === 'then') return undefined;
      return nothing;
    },
  }) as ExtensionAPI;
}

async function runFactory(factory: ExtensionFactory): Promise<RecordedTool[]> {
  const tools: RecordedTool[] = [];
  await factory(recordingApi(tools));
  return tools;
}

function entriesFor(tools: RecordedTool[], source: string): InventoryEntry[] {
  return tools.flatMap((tool): InventoryEntry[] => {
    let actions: string[] | null;
    try {
      actions = actionsOf(tool.parameters);
    } catch (error) {
      throw new Error(`${tool.name} (${source}): ${(error as Error).message}`, { cause: error });
    }
    return actions === null
      ? [{ tool: tool.name, action: null, source }]
      : actions.map((action) => ({ tool: tool.name, action, source }));
  });
}

async function platformTools(): Promise<InventoryEntry[]> {
  // A container runtime with browser automation gets every platform tool,
  // including `automation_browser`, without a browser pack on this machine.
  const runtime = {
    backend: 'docker',
    workspaceId: 'tool-check',
    capabilities: { browserAutomation: true },
  } as unknown as RuntimeBackend;
  return entriesFor(await createRuntimeTools(runtime, 'tool-check'), 'platform');
}

async function inlineTools(): Promise<InventoryEntry[]> {
  const agentTools: RecordedTool[] = [];
  const api = recordingApi(agentTools);
  registerSubagentTool(api, {} as SubagentManager, 'tool-check', 'tool-check');
  registerCreateAgentTool(api);
  return [
    ...entriesFor(await runFactory(createSeroCodemodeExtension()), 'inline'),
    ...entriesFor(await runFactory(createSeroToolSearchExtension()), 'inline'),
    ...entriesFor(agentTools, 'inline'),
  ];
}

interface PluginManifest {
  pi?: { extensions?: string[] };
  sero?: { plugin?: { uiOnlyTools?: string[] } };
}

async function pluginTools(): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];
  for (const dir of readdirSync(PLUGINS_DIR).sort()) {
    const manifestPath = path.join(PLUGINS_DIR, dir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
    const uiOnly = new Set(manifest.sero?.plugin?.uiOnlyTools ?? []);
    for (const extension of manifest.pi?.extensions ?? []) {
      const url = pathToFileURL(path.join(PLUGINS_DIR, dir, extension)).href;
      const module = (await import(url)) as { default: ExtensionFactory };
      const tools = (await runFactory(module.default)).filter((tool) => !uiOnly.has(tool.name));
      entries.push(...entriesFor(tools, dir));
    }
  }
  return entries;
}

function cliCommands(): InventoryEntry[] {
  const registry = new CliRegistry();
  registerCoreCommands(registry);
  return registry.list().flatMap((command): InventoryEntry[] => {
    const tool = `sero ${command.name}`;
    const subcommands = registry.subcommandNames(command.name);
    return subcommands.length === 0
      ? [{ tool, action: null, source: 'cli' }]
      : subcommands.map((action) => ({ tool, action, source: 'cli' }));
  });
}

export async function buildToolInventory(): Promise<InventoryEntry[]> {
  const entries = [
    ...(await platformTools()),
    ...(await inlineTools()),
    ...(await pluginTools()),
    ...cliCommands(),
  ];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.tool}:${entry.action}`;
    if (seen.has(key)) throw new Error(`Two sources give ${key}`);
    seen.add(key);
  }
  return entries;
}
