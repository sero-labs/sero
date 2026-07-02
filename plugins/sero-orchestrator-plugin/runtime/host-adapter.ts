/**
 * Builds the concrete OrchestratorHost from the desktop AppRuntimeContext.
 *
 * The plugin's runtime logic depends only on OrchestratorHost (host.ts), so
 * unit tests can swap in a fake. This adapter is the single place that touches
 * the real `ctx.host` seams.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { OrchestratorHost } from './host';
import { createLoopStore } from './loop-store';
import { createLibraryStore } from './library-store';

/**
 * Resolves `relativePath` under `baseDir` and confirms the result stays inside
 * it — an artifact path must never escape the state dir (defence-in-depth on top
 * of step-id slug validation). Returns null when the path escapes.
 */
function resolveWithin(baseDir: string, target: string): string | null {
  const absolute = path.isAbsolute(target) ? target : path.resolve(baseDir, target);
  const rel = path.relative(baseDir, absolute);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return absolute;
}

export function createOrchestratorHost(ctx: AppRuntimeContext): OrchestratorHost {
  const stateDir = path.dirname(ctx.stateFilePath);
  const store = createLoopStore(ctx);
  const library = createLibraryStore(ctx);

  return {
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,
    stateDir,

    readState: () => store.readState(),
    updateState: (updater) => store.updateState(updater),

    runStructured: (params) =>
      ctx.host.subagents.runStructured({
        task: params.task,
        agent: params.agent,
        systemPrompt: params.systemPrompt,
        appendSystemPrompt: params.appendSystemPrompt,
        systemPromptOverride: params.systemPromptOverride,
        model: params.model,
        thinking: params.thinking,
        parentSessionId: params.parentSessionId,
        workspaceId: ctx.workspaceId,
        cwd: params.cwd,
        platformTools: params.platformTools,
        tools: params.tools,
        disabledTools: params.disabledTools,
        disabledSkills: params.disabledSkills,
        signal: params.signal,
        repair: params.repair,
        onUpdate: params.onUpdate,
      }),

    listAvailableModels: () => ctx.host.models.list(),

    listToolCatalog: () => ctx.host.subagents.listToolCatalog(ctx.workspaceId),

    listAgentCatalog: () => ctx.host.subagents.listAgentCatalog(ctx.workspaceId),

    writeArtifact: async (relativePath, content) => {
      // relativePath is resolved under the state dir, so callers place artifacts
      // in their per-loop folder (loops/<loopId>/artifacts/...). Containment is
      // enforced so a crafted path can never write outside the state tree.
      const absolute = resolveWithin(stateDir, relativePath);
      if (!absolute) throw new Error(`artifact path escapes the state dir: ${relativePath}`);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
      return absolute;
    },
    readArtifact: async (ref) => {
      // Accept an absolute ref (as returned by writeArtifact) OR a path relative
      // to the state dir — so callers can read a known colocated file (e.g. a
      // loop's digests.json) without having persisted the write ref. A ref that
      // resolves outside the state dir is treated as absent.
      const absolute = resolveWithin(stateDir, ref);
      if (!absolute) return null;
      try {
        return await readFile(absolute, 'utf8');
      } catch {
        return null;
      }
    },

    createWorktree: async (loopId, title) => {
      const result = await ctx.host.git.createWorktree(ctx.workspacePath, loopId, title);
      return { worktreePath: result.worktreePath, branchName: result.branchName };
    },
    removeWorktree: (loopId, options) => ctx.host.git.removeWorktree(ctx.workspacePath, loopId, options),
    getWorkspaceStatus: () => ctx.host.git.getWorkspaceStatus(ctx.workspacePath),
    stashWorkspaceChanges: (message) => ctx.host.git.stashWorkspaceChanges(ctx.workspacePath, message),
    listPullRequests: () => ctx.host.git.listPullRequests(ctx.workspacePath),
    runCommand: (command, timeoutMs) => ctx.host.workspace.runCommand(ctx.workspaceId, ctx.workspacePath, command, timeoutMs),

    notify: (message, type) => ctx.host.notifications.notify({ message, type }),
    requestChoice: (request) => ctx.host.notifications.requestChoice(request),

    session: ctx.host.session,

    library,

    now: () => new Date().toISOString(),
    newId: (prefix) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID()),
    log: (message) => console.log(`[orchestrator] ${message}`),
  };
}
