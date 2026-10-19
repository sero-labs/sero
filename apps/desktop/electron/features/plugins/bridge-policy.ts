import { existsSync, readFileSync } from 'fs';
import path from 'path';

import type { LoadExtensionsResult } from '@earendil-works/pi-coding-agent';

export type PluginBridgeToolsSetting = boolean | string[];

/** Chat, subagent (including workflow steps) and member (Architect and Room members). */
export type ToolSessionKind = 'chat' | 'subagent' | 'member';

const SESSION_KINDS: ReadonlySet<string> = new Set<ToolSessionKind>(['chat', 'subagent', 'member']);

interface PluginBridgePolicy {
  bridgeAll: boolean;
  toolNames: Set<string>;
  /** Tools that declare the session kinds they are for. A tool not listed is for every kind. */
  toolSessionKinds: Map<string, Set<string>>;
  /** Tools the plugin's UI calls through `appAgent.invokeTool`. No model may reach them. */
  uiOnlyToolNames: Set<string>;
}

interface PluginPkgJson {
  sero?: {
    plugin?: {
      bridgeTools?: PluginBridgeToolsSetting;
      toolSessionKinds?: Record<string, unknown>;
      uiOnlyTools?: unknown;
    };
  };
}

const policyCache = new Map<string, PluginBridgePolicy | null>();

function findPackageRoot(filePath: string): string | null {
  let current = path.dirname(filePath);

  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    if (existsSync(packageJsonPath)) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseToolSessionKinds(setting: Record<string, unknown> | undefined): Map<string, Set<string>> {
  const kinds = new Map<string, Set<string>>();
  for (const [tool, declared] of Object.entries(setting ?? {})) {
    if (!Array.isArray(declared)) continue;
    kinds.set(tool, new Set(declared.filter((kind): kind is string => typeof kind === 'string' && SESSION_KINDS.has(kind))));
  }
  return kinds;
}

function parseUiOnlyTools(setting: unknown): Set<string> {
  if (!Array.isArray(setting)) return new Set();
  return new Set(setting.filter((name): name is string => typeof name === 'string' && !!name));
}

function parseBridgePolicy(plugin: NonNullable<NonNullable<PluginPkgJson['sero']>['plugin']>): PluginBridgePolicy {
  const setting = plugin.bridgeTools;
  const toolSessionKinds = parseToolSessionKinds(plugin.toolSessionKinds);
  const uiOnlyToolNames = parseUiOnlyTools(plugin.uiOnlyTools);
  if (setting === false) {
    return { bridgeAll: false, toolNames: new Set(), toolSessionKinds, uiOnlyToolNames };
  }

  if (Array.isArray(setting)) {
    return {
      bridgeAll: false,
      toolNames: new Set(setting.filter((name): name is string => typeof name === 'string' && !!name)),
      toolSessionKinds,
      uiOnlyToolNames,
    };
  }

  return { bridgeAll: true, toolNames: new Set(), toolSessionKinds, uiOnlyToolNames };
}

export function getPluginBridgePolicy(extensionPath: string): PluginBridgePolicy | null {
  const resolvedPath = path.resolve(extensionPath);
  const cached = policyCache.get(resolvedPath);
  if (cached !== undefined) return cached;

  const packageRoot = findPackageRoot(resolvedPath);
  if (!packageRoot) {
    policyCache.set(resolvedPath, null);
    return null;
  }

  try {
    const raw = readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as PluginPkgJson;

    if (!pkg.sero?.plugin) {
      policyCache.set(resolvedPath, null);
      return null;
    }

    const policy = parseBridgePolicy(pkg.sero.plugin);
    policyCache.set(resolvedPath, policy);
    return policy;
  } catch {
    policyCache.set(resolvedPath, null);
    return null;
  }
}

const clearListeners = new Set<() => void>();

/** Run `listener` whenever a plugin is installed, replaced, removed or refreshed. */
export function onPluginBridgePolicyCleared(listener: () => void): void {
  clearListeners.add(listener);
}

export function clearPluginBridgePolicyCache(): void {
  policyCache.clear();
  for (const listener of clearListeners) listener();
}

/** Whether the plugin behind `extensionPath` allows this tool in this kind of session. */
export function isToolForSessionKind(extensionPath: string, name: string, kind: ToolSessionKind): boolean {
  return getPluginBridgePolicy(extensionPath)?.toolSessionKinds.get(name)?.has(kind) ?? true;
}

/**
 * Whether this tool exists only for the plugin's own UI. Its actions count as the
 * user's, so a model must never reach it: not as a declared tool, not through
 * codemode or tool search, and not as a `sero-cli` command.
 */
export function isUiOnlyTool(extensionPath: string, name: string): boolean {
  return getPluginBridgePolicy(extensionPath)?.uiOnlyToolNames.has(name) ?? false;
}

/**
 * Neutralize every UI-only tool so no model can reach it, while leaving it
 * registered for `appAgent.invokeTool`. A plugin declares its list in
 * `sero.plugin.uiOnlyTools`; a tool that names the `hidden` exposure itself does
 * not need the declaration, but the declaration keeps a forgotten line harmless.
 */
export function hideUiOnlyTools(base: LoadExtensionsResult): LoadExtensionsResult {
  for (const extension of base.extensions) {
    for (const [name, registered] of [...extension.tools]) {
      if (registered.definition.exposure === 'hidden') continue;
      if (!isUiOnlyTool(extension.resolvedPath, name)) continue;
      extension.tools.set(name, { ...registered, definition: { ...registered.definition, exposure: 'hidden' } });
    }
  }
  return base;
}

/**
 * Remove every tool that its plugin does not declare for this session kind, and
 * any slash command that shares its name. An allowlist cannot bring a removed
 * tool back, because the session never loads it.
 */
export function dropToolsNotForSessionKind(
  base: LoadExtensionsResult,
  kind: ToolSessionKind,
): LoadExtensionsResult {
  for (const extension of base.extensions) {
    for (const name of [...extension.tools.keys()]) {
      if (isToolForSessionKind(extension.resolvedPath, name, kind)) continue;
      extension.tools.delete(name);
      extension.commands.delete(name);
    }
  }
  return base;
}
