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
import { DEFAULT_STATE } from '../shared/defaults';
import type { OrchestratorState } from '../shared/types';
import type { OrchestratorHost } from './host';

export function createOrchestratorHost(ctx: AppRuntimeContext): OrchestratorHost {
  const stateDir = path.dirname(ctx.stateFilePath);
  const artifactsRoot = path.join(stateDir, 'artifacts');

  return {
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,
    stateDir,

    readState: () => ctx.host.appState.read<OrchestratorState>(ctx.stateFilePath),
    updateState: (updater) =>
      ctx.host.appState.update<OrchestratorState>(ctx.stateFilePath, (current) =>
        updater(current ?? structuredClone(DEFAULT_STATE)),
      ),

    runStructured: (params) =>
      ctx.host.subagents.runStructured({
        task: params.task,
        systemPrompt: params.systemPrompt,
        model: params.model,
        thinking: params.thinking,
        parentSessionId: params.parentSessionId,
        workspaceId: ctx.workspaceId,
        cwd: params.cwd,
        platformTools: params.platformTools,
        signal: params.signal,
        onUpdate: params.onUpdate,
      }),

    writeArtifact: async (relativePath, content) => {
      const absolute = path.join(artifactsRoot, relativePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
      return absolute;
    },
    readArtifact: async (ref) => {
      try {
        return await readFile(ref, 'utf8');
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

    notify: (message, type) => ctx.host.notifications.notify({ message, type }),
    requestChoice: (request) => ctx.host.notifications.requestChoice(request),

    session: ctx.host.session,

    now: () => new Date().toISOString(),
    newId: (prefix) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID()),
    log: (message) => console.log(`[orchestrator] ${message}`),
  };
}
