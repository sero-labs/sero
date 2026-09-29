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
import { readFileSync, writeFileSync } from 'fs';
import {
  createAgentSession,
  SessionManager,
  type ToolInfo,
} from '@earendil-works/pi-coding-agent';
import type { ContextToolInfo } from '@sero-ai/common';
import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { SERO_AGENT_DIR, SERO_HOME } from '@electron/platform/env';
import { isToolForSessionKind, type ToolSessionKind } from '@electron/features/plugins/bridge-policy';
import { packageRootForResourcePath } from '@electron/features/plugins/resource-compatibility';
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

/** Tool name -> the plugin package that registers it. Filled from real sessions, never persisted. */
const toolPackages = new Map<string, string>();

// name -> ContextToolInfo, seeded with the platform baseline.
const catalog = new Map<string, ContextToolInfo>(
  STATIC_PLATFORM_TOOLS.map((tool) => [tool.name, tool]),
);

function cachePath(): string {
  return path.join(SERO_HOME, 'subagent-tools.json');
}

function persist(): void {
  try {
    writeFileSync(cachePath(), JSON.stringify({ tools: [...catalog.values()] }, null, 2));
  } catch (err) {
    console.warn('[subagent-tools] persist failed:', err);
  }
}

function loadPersisted(): void {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), 'utf8')) as { tools?: ContextToolInfo[] };
    for (const tool of parsed.tools ?? []) {
      if (tool?.name) catalog.set(tool.name, { name: tool.name, description: tool.description });
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
 * left out, so no approval offers a tool the session would never get.
 */
export function getToolCatalogFor(kind: ToolSessionKind): ContextToolInfo[] {
  return [...catalog.values()].filter((tool) => {
    const packagePath = toolPackages.get(tool.name);
    return !packagePath || isToolForSessionKind(path.join(packagePath, 'package.json'), tool.name, kind);
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
    const packagePath = packageRootForResourcePath(tool.sourceInfo.path);
    if (packagePath) toolPackages.set(tool.name, packagePath);
  }
  if (merge(tools.map((tool) => ({ name: tool.name, description: tool.description })))) persist();
}

let warmed = false;

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
