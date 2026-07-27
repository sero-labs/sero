/**
 * The runtime's view of Sero.
 *
 * Everything the coordinator needs is expressed here so the whole runtime can
 * be exercised in tests with a fake host and a temporary storage root.
 */

import type { AppRuntimeContext } from '@sero-ai/common';
import { mutateState, readState } from '../shared/state-io';
import { storagePathsFromStateFile, type StoragePaths } from '../shared/paths';
import { DEFAULT_STATE, type DesignLibraryState } from '../shared/state';

export interface ModelRunParams {
  task: string;
  systemPrompt?: string;
  /** Absolute directory the run's read tool works from. */
  cwd?: string;
  /** 'readOnly' gives the run Pi's read tool, which attaches images. */
  platformTools?: 'all' | 'readOnly' | 'none';
  customTools?: unknown[];
  repair?: { maxAttempts: number; validate: (reply: string) => string | null };
  signal?: AbortSignal;
  sessionKey: string;
}

export interface ModelRunResult {
  response: string;
  error?: string;
  modelId?: string;
  providerId?: string;
  durationMs?: number;
  costUsd?: number;
}

export interface RuntimeHost {
  paths: StoragePaths;
  workspaceId: string;
  workspacePath: string;
  readState(): Promise<DesignLibraryState>;
  updateState(updater: (current: DesignLibraryState) => DesignLibraryState): Promise<void>;
  runModel(params: ModelRunParams): Promise<ModelRunResult>;
  /** Resolve a secret for a non-model provider (e.g. `fal`). */
  secret(name: string): Promise<string | null>;
  now(): number;
  log(message: string): void;
}

export function createRuntimeHost(ctx: AppRuntimeContext, secret: (name: string) => Promise<string | null>): RuntimeHost {
  const paths = storagePathsFromStateFile(ctx.stateFilePath);

  return {
    paths,
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,

    async readState() {
      return (await readState(paths.stateFile)) ?? structuredClone(DEFAULT_STATE);
    },

    async updateState(updater) {
      await mutateState(paths.stateFile, updater);
    },

    async runModel(params) {
      const result = await ctx.host.subagents.runStructured({
        task: params.task,
        ...(params.systemPrompt ? { appendSystemPrompt: [params.systemPrompt] } : {}),
        parentSessionId: `design-library:${ctx.workspaceId}:${params.sessionKey}`,
        workspaceId: ctx.workspaceId,
        cwd: params.cwd ?? ctx.workspacePath,
        isolated: true,
        platformTools: params.platformTools ?? 'none',
        ...(params.customTools ? { customTools: params.customTools } : {}),
        ...(params.repair ? { repair: params.repair } : {}),
        ...(params.signal ? { signal: params.signal } : {}),
      });

      return {
        response: result.response,
        ...(result.error ? { error: result.error } : {}),
        ...(result.modelId ? { modelId: result.modelId } : {}),
        ...(result.providerId ? { providerId: result.providerId } : {}),
        ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
        ...(result.usage?.costUsd !== undefined ? { costUsd: result.usage.costUsd } : {}),
      };
    },

    secret,
    now: () => Date.now(),
    log: (message) => console.log(`[design-library] ${message}`),
  };
}
