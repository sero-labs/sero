/**
 * Subagent tool catalog — the real tool surface a background subagent loads.
 *
 * Published once at startup by a throwaway enumeration session (no container,
 * so it surfaces the installed plugins' tools); seeded with the static platform
 * baseline (the container tools, which need no enumeration); and refreshed from
 * every real subagent run, which also captures any lazily-registered tools such
 * as connected MCP servers.
 *
 * Consumers: the loop context IPC (`subagent-context`) and the orchestrator
 * planner's per-step tool catalog.
 */

import path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import {
  createAgentSession,
  SessionManager,
  type ToolInfo,
} from '@earendil-works/pi-coding-agent';
import type { ContextToolInfo } from '@sero-ai/common';
import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { SERO_AGENT_DIR, SERO_HOME } from '@electron/platform/env';
import { isToolForSessionKind, onPluginBridgePolicyCleared, type ToolSessionKind } from '@electron/features/plugins/bridge-policy';
import { packageRootForResourcePath } from '@electron/features/plugins/resource-compatibility';
import { CODEMODE_TOOL_NAME } from '@electron/features/codemode';
import { createSubagentResourceLoader } from './resource-loader';

/**
 * Lean coding baseline — the platform/container tools every subagent gets.
 * These come from the container runtime (not the resource loader), so the
 * throwaway enumeration session can't see them; they are listed statically.
 */
export const STATIC_PLATFORM_TOOLS: ContextToolInfo[] = [
  { name: 'bash', description: 'Run shell commands in the workspace' },
  { name: 'read', description: 'Read a file' },
  { name: 'write', description: 'Write a file' },
  { name: 'edit', description: 'Edit a file' },
  { name: 'sero-cli', description: 'Run Sero workspace commands' },
  { name: 'automation_browser', description: 'Drive an automation browser (when available)' },
];

/** Tool name -> the plugin package that registers it. Filled from real sessions and saved with the cache. */
const toolPackages = new Map<string, string>();

/**
 * A platform tool belongs to no plugin. A run from source reports it with a
 * path inside the desktop app's own package, and treating that as its plugin
 * drops `sero-cli` from every managed session's approval.
 */
const PLATFORM_TOOL_NAMES = new Set(STATIC_PLATFORM_TOOLS.map((tool) => tool.name));

/** Tool names a real session has reported since this process started. The saved cache alone does not count. */
const seenThisProcess = new Set<string>();

// name -> ContextToolInfo, seeded with the platform baseline.
const catalog = new Map<string, ContextToolInfo>(
  STATIC_PLATFORM_TOOLS.map((tool) => [tool.name, tool]),
);

function cachePath(): string {
  return path.join(SERO_HOME, 'subagent-tools.json');
}

/** The cache holds each plugin tool's package. A cache without `version` has none, so it is ignored. */
const CACHE_VERSION = 2;

interface PersistedTool extends ContextToolInfo {
  packagePath?: string;
}

function persist(): void {
  try {
    const tools: PersistedTool[] = [...catalog.values()].map((tool) => ({ ...tool, packagePath: toolPackages.get(tool.name) }));
    writeFileSync(cachePath(), JSON.stringify({ version: CACHE_VERSION, tools }, null, 2));
  } catch (err) {
    console.warn('[subagent-tools] persist failed:', err);
  }
}

function loadPersisted(): void {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), 'utf8')) as { version?: number; tools?: PersistedTool[] };
    if (parsed.version !== CACHE_VERSION) return;
    for (const tool of parsed.tools ?? []) {
      if (!tool?.name) continue;
      // A plugin that was uninstalled leaves a tool no session can load. Drop it.
      if (tool.packagePath && !existsSync(path.join(tool.packagePath, 'package.json'))) continue;
      catalog.set(tool.name, { name: tool.name, description: tool.description });
      if (tool.packagePath && !PLATFORM_TOOL_NAMES.has(tool.name)) toolPackages.set(tool.name, tool.packagePath);
    }
  } catch {
    // No cache yet — the baseline + startup enumeration fill it in.
  }
}
loadPersisted();

/** Union tools into the catalog by name (real descriptions win). */
function merge(tools: ContextToolInfo[]): boolean {
  let changed = false;
  for (const tool of tools) {
    if (!tool.name) continue;
    const prev = catalog.get(tool.name);
    if (!prev || prev.description !== tool.description) {
      catalog.set(tool.name, { name: tool.name, description: tool.description });
      changed = true;
    }
  }
  return changed;
}

/** The plugin package that registers this tool, or undefined for a platform tool. */
export function getToolPackagePath(toolName: string): string | undefined {
  return toolPackages.get(toolName);
}

/**
 * The published catalog for one kind of session (always a superset of the
 * platform baseline). A tool whose plugin does not declare it for that kind is
 * left out, so no approval offers a tool the session would never get. A member
 * is approved for a tool by name and fails to start without it, so a plugin tool
 * counts for a member only when a real session has reported it in this process,
 * which drops a tool that an updated plugin removed or renamed.
 */
export function getToolCatalogFor(kind: ToolSessionKind): ContextToolInfo[] {
  return [...catalog.values()].filter((tool) => {
    // The warm-up session loads `codemode`, and a member session does not.
    if (kind === 'member' && tool.name === CODEMODE_TOOL_NAME) return false;
    const packagePath = toolPackages.get(tool.name);
    if (!packagePath) return true;
    if (kind === 'member' && !seenThisProcess.has(tool.name)) return false;
    return isToolForSessionKind(path.join(packagePath, 'package.json'), tool.name, kind);
  });
}

export function getSubagentToolCatalog(): ContextToolInfo[] {
  return getToolCatalogFor('subagent');
}

/**
 * Union a real run's resolved tool set into the catalog. Cheap, push-model:
 * the runner calls this once per run with `session.getAllTools()`.
 */
export function recordRunToolCatalog(tools: ToolInfo[]): void {
  for (const tool of tools) {
    seenThisProcess.add(tool.name);
    if (PLATFORM_TOOL_NAMES.has(tool.name)) continue;
    const packagePath = packageRootForResourcePath(tool.sourceInfo.path);
    if (packagePath) toolPackages.set(tool.name, packagePath);
  }
  if (merge(tools.map((tool) => ({ name: tool.name, description: tool.description })))) persist();
}

let warmed = false;

// A plugin that was replaced may have renamed or dropped a tool. Forget what this process
// has seen, so the next warm-up enumerates the plugins as they are now.
onPluginBridgePolicyCleared(() => {
  seenThisProcess.clear();
  warmed = false;
});

/**
 * Publish the catalog from a throwaway enumeration session. No container is
 * started, so this surfaces the installed plugins' tools; the static platform
 * baseline covers the container tools. Fire-and-forget at startup; runs at most
 * once (a failure clears the guard so a later call can retry).
 */
export async function warmSubagentToolCatalog(): Promise<void> {
  if (warmed) return;
  warmed = true;
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null;
  try {
    const infra = await ensureAiInfra();
    const loader = createSubagentResourceLoader({
      cwd: SERO_AGENT_DIR,
      workspaceManager,
      workspaceId: 'catalog-warmup',
      sessionId: 'subagent-tool-catalog',
      settingsManager: infra.settingsManager,
      // The catalogue holds every tool with its package. Each consumer then
      // filters it for the kind of session it serves.
      keepToolsForOtherSessionKinds: true,
    });
    await loader.reload();
    const result = await createAgentSession({
      cwd: SERO_AGENT_DIR,
      agentDir: SERO_AGENT_DIR,
      modelRuntime: infra.modelRuntime,
      noTools: 'builtin',
      customTools: [],
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(SERO_AGENT_DIR),
      settingsManager: infra.settingsManager,
    });
    session = result.session;
    recordRunToolCatalog(session.getAllTools());
  } catch (err) {
    warmed = false;
    console.warn('[subagent-tools] startup enumeration failed:', err);
  } finally {
    try { session?.dispose(); } catch { /* ignore */ }
  }
}
