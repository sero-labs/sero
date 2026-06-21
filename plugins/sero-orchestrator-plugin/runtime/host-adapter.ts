/**
 * Builds the concrete OrchestratorHost from the desktop AppRuntimeContext.
 *
 * The plugin's runtime logic depends only on OrchestratorHost (host.ts), so
 * unit tests can swap in a fake. This adapter is the single place that touches
 * the real `ctx.host` seams.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { DEFAULT_STATE } from '../shared/defaults';
import type { OrchestratorState } from '../shared/types';
import type { OrchestratorHost } from './host';

export function createOrchestratorHost(ctx: AppRuntimeContext): OrchestratorHost {
  const stateDir = path.dirname(ctx.stateFilePath);

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

    now: () => new Date().toISOString(),
    newId: (prefix) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID()),
    log: (message) => console.log(`[orchestrator] ${message}`),
  };
}
