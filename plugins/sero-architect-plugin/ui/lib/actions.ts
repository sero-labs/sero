/**
 * Every UI action goes through the `architect_projects` tool, the same door
 * the user's chat uses. The page never writes a record itself.
 */

import { useCallback, useMemo } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import type { AppToolResult } from '@sero-ai/app-runtime';
import type { ModelTier, ThinkingLevel } from '@sero-ai/common';

import type { AutonomySetting, ExecutionMode } from '../../shared/record';
import { readTracePage, type TracePage } from './trace';

export interface ActionOutcome {
  ok: boolean;
  text: string;
  projectId?: string;
}

export function toOutcome(result: AppToolResult): ActionOutcome {
  const details = result.details ?? {};
  const ok = typeof details.ok === 'boolean' ? details.ok : !result.isError;
  const text = result.text.replace(/^Error:\s*/, '');
  const projectId = typeof details.projectId === 'string' ? details.projectId : undefined;
  return projectId ? { ok, text, projectId } : { ok, text };
}

export interface SessionHistoryEntry {
  turnIndex: number;
  timestamp: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  compactionBoundary?: boolean;
}

export interface SessionHistoryOutcome extends ActionOutcome {
  entries: SessionHistoryEntry[];
}

/** What the inspector asks for. `detail` is opt-in, so a summary reads no records. */
export interface TraceRequest {
  runId?: string;
  afterSeq?: number;
  limit?: number;
  detail?: boolean;
  knownSpendUsd?: number;
}

export interface TraceOutcome extends ActionOutcome {
  page: TracePage | null;
}

function readHistoryEntries(result: AppToolResult): SessionHistoryEntry[] {
  const raw = result.details?.entries;
  if (!Array.isArray(raw)) return [];
  const entries: SessionHistoryEntry[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || !('turnIndex' in entry) || !('timestamp' in entry) || !('role' in entry) || !('text' in entry)) continue;
    const role = entry.role;
    if (typeof entry.turnIndex !== 'number' || typeof entry.timestamp !== 'string' || typeof entry.text !== 'string') continue;
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
    entries.push({
      turnIndex: entry.turnIndex,
      timestamp: entry.timestamp,
      role,
      text: entry.text,
      ...('compactionBoundary' in entry && entry.compactionBoundary === true ? { compactionBoundary: true } : {}),
    });
  }
  return entries;
}

export interface ArchitectActions {
  create(idea: string, folder: string, executionMode?: ExecutionMode): Promise<ActionOutcome>;
  history(projectId: string): Promise<SessionHistoryOutcome>;
  trace(projectId: string, query: TraceRequest): Promise<TraceOutcome>;
  pause(projectId: string): Promise<ActionOutcome>;
  resume(projectId: string): Promise<ActionOutcome>;
  retry(projectId: string, milestoneId: string, maxCostUsd?: number): Promise<ActionOutcome>;
  stop(projectId: string): Promise<ActionOutcome>;
  remove(projectId: string): Promise<ActionOutcome>;
  raiseCap(projectId: string, capUsd: number): Promise<ActionOutcome>;
  setExecutionMode(projectId: string, mode: ExecutionMode): Promise<ActionOutcome>;
  setAutonomy(projectId: string, autonomy: AutonomySetting): Promise<ActionOutcome>;
  /** Save one project tier default. A model the catalogue does not offer is refused. */
  setModelDefault(projectId: string, tier: ModelTier, model: string, thinking?: ThinkingLevel): Promise<ActionOutcome>;
  /** Clear one override so the tier inherits the global selection again. */
  clearModelDefault(projectId: string, tier: ModelTier): Promise<ActionOutcome>;
  /** Re-reads the host's global model tiers into the cached record. */
  refreshModelTiers(projectId: string): Promise<ActionOutcome>;
  approveCharter(projectId: string): Promise<ActionOutcome>;
  approveMilestone(projectId: string, milestoneId: string): Promise<ActionOutcome>;
  answer(projectId: string, decisionId: string, optionId: string, note: string): Promise<ActionOutcome>;
  directive(projectId: string, text: string): Promise<ActionOutcome>;
}

export const PROJECTS_TOOL = 'architect_projects';

export function useArchitectActions(): ArchitectActions {
  const { run } = useAppTools();
  const call = useCallback(
    async (params: Record<string, unknown>): Promise<ActionOutcome> => {
      try {
        return toOutcome(await run(PROJECTS_TOOL, params));
      } catch (error) {
        return { ok: false, text: error instanceof Error ? error.message : String(error) };
      }
    },
    [run],
  );

  return useMemo<ArchitectActions>(
    () => ({
      create: (idea, folder, executionMode = 'workspace') => call({ action: 'create', idea, folder, executionMode }),
      history: async (projectId) => {
        try {
          const result = await run(PROJECTS_TOOL, { action: 'history', projectId });
          return { ...toOutcome(result), entries: readHistoryEntries(result) };
        } catch (error) {
          return { ok: false, text: error instanceof Error ? error.message : String(error), entries: [] };
        }
      },
      trace: async (projectId, query) => {
        try {
          const result = await run(PROJECTS_TOOL, { action: 'trace', projectId, ...query });
          return { ...toOutcome(result), page: readTracePage(result) };
        } catch (error) {
          return { ok: false, text: error instanceof Error ? error.message : String(error), page: null };
        }
      },
      pause: (projectId) => call({ action: 'pause', projectId }),      resume: (projectId) => call({ action: 'resume', projectId }),
      retry: (projectId, milestoneId, capUsd) => call({ action: 'retry', projectId, milestoneId, capUsd }),
      stop: (projectId) => call({ action: 'stop', projectId }),
      remove: (projectId) => call({ action: 'delete', projectId }),
      raiseCap: (projectId, capUsd) => call({ action: 'raise_cap', projectId, capUsd }),
      setExecutionMode: (projectId, executionMode) => call({ action: 'set_execution_mode', projectId, executionMode }),
      setAutonomy: (projectId, autonomy) => call({ action: 'set_autonomy', projectId, autonomy }),
      setModelDefault: (projectId, tier, model, thinking) => call({ action: 'set_model_tier', projectId, tier, model, thinking }),
      clearModelDefault: (projectId, tier) => call({ action: 'clear_model_tier', projectId, tier }),
      refreshModelTiers: (projectId) => call({ action: 'refresh_model_tiers', projectId }),
      approveCharter: (projectId) => call({ action: 'approve', projectId, target: 'charter' }),
      approveMilestone: (projectId, milestoneId) => call({ action: 'approve', projectId, target: 'milestone', milestoneId }),
      answer: (projectId, decisionId, optionId, note) =>
        call({ action: 'answer', projectId, decisionId, optionId, ...(note.trim() ? { note: note.trim() } : {}) }),
      directive: (projectId, text) => call({ action: 'directive', projectId, text }),
    }),
    [call, run],
  );
}
