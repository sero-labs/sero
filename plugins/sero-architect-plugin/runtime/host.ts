/**
 * The narrow host surface the Architect runtime uses, on the Orchestrator's
 * `OrchestratorHost` precedent: tests fake this interface in full, and the
 * production adapter is the only place that knows `AppRuntimeContext`.
 */

import type { AppRuntimeContext, AppRuntimeWorkspaceInfo } from '@sero-ai/common';

import type { ArchitectIndex } from '../shared/types';

export interface ArchitectHost {
  /** `<SERO_HOME>/apps/architect`, created if missing. */
  homeDir(): Promise<string>;
  /** The app state file path the host watches; the index lives there. */
  indexFile: string;
  updateIndex(updater: (current: ArchitectIndex | null) => ArchitectIndex): Promise<void>;
  listWorkspaces(): Promise<AppRuntimeWorkspaceInfo[]>;
  now(): string;
  log(message: string): void;
}

export function createArchitectHost(ctx: AppRuntimeContext): ArchitectHost {
  return {
    homeDir: async () => (await ctx.host.appState.globalDir('architect')).path,
    indexFile: ctx.stateFilePath,
    updateIndex: (updater) => ctx.host.appState.update<ArchitectIndex>(ctx.stateFilePath, updater),
    listWorkspaces: () => ctx.host.workspace.list(),
    now: () => new Date().toISOString(),
    log: (message) => console.log(`[architect] ${message}`),
  };
}
