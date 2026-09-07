/**
 * Every UI action goes through the `architect_projects` tool, the same door
 * the user's chat uses. The page never writes a record itself.
 */

import { useCallback, useMemo } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import type { AppToolResult } from '@sero-ai/app-runtime';

import type { AutonomySetting } from '../../shared/record';

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

export interface ArchitectActions {
  create(idea: string, folder: string): Promise<ActionOutcome>;
  pause(projectId: string): Promise<ActionOutcome>;
  resume(projectId: string): Promise<ActionOutcome>;
  stop(projectId: string): Promise<ActionOutcome>;
  remove(projectId: string): Promise<ActionOutcome>;
  raiseCap(projectId: string, capUsd: number): Promise<ActionOutcome>;
  setAutonomy(projectId: string, autonomy: AutonomySetting): Promise<ActionOutcome>;
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
      create: (idea, folder) => call({ action: 'create', idea, folder }),
      pause: (projectId) => call({ action: 'pause', projectId }),
      resume: (projectId) => call({ action: 'resume', projectId }),
      stop: (projectId) => call({ action: 'stop', projectId }),
      remove: (projectId) => call({ action: 'delete', projectId }),
      raiseCap: (projectId, capUsd) => call({ action: 'raise_cap', projectId, capUsd }),
      setAutonomy: (projectId, autonomy) => call({ action: 'set_autonomy', projectId, autonomy }),
      approveCharter: (projectId) => call({ action: 'approve', projectId, target: 'charter' }),
      approveMilestone: (projectId, milestoneId) => call({ action: 'approve', projectId, target: 'milestone', milestoneId }),
      answer: (projectId, decisionId, optionId, note) =>
        call({ action: 'answer', projectId, decisionId, optionId, ...(note.trim() ? { note: note.trim() } : {}) }),
      directive: (projectId, text) => call({ action: 'directive', projectId, text }),
    }),
    [call],
  );
}
