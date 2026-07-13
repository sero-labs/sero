/**
 * Calls into the Orchestrator plugin: open its app (optionally on a specific
 * loop) and edit a loop's schedule through its `orchestrator` tool.
 */

import { getSeroApi, openSeroApp } from '@sero-ai/app-runtime';
import type { OrchestratorSetScheduleParams } from '@sero-ai/common';
import { ORCHESTRATOR_APP_ID } from '@sero-ai/common';

/** Switch to the Orchestrator app, landing on the loop's detail when given. */
export function openOrchestrator(loopId?: string): Promise<boolean> {
  return openSeroApp(ORCHESTRATOR_APP_ID, loopId ? { loopId } : undefined);
}

/**
 * Update a loop trigger's cron schedule and/or paused state.
 * Resolves to null on success, an error message otherwise.
 */
export async function setLoopSchedule(
  workspaceId: string,
  params: Omit<OrchestratorSetScheduleParams, 'action'>,
): Promise<string | null> {
  const { appAgent } = getSeroApi();
  if (!appAgent.invokeTool) return 'App tool bridge unavailable.';
  try {
    const res = await appAgent.invokeTool(ORCHESTRATOR_APP_ID, workspaceId, 'orchestrator', {
      action: 'set_schedule',
      ...params,
    });
    const details = res.details as { ok?: boolean; error?: string } | null;
    if (res.isError || details?.ok === false) {
      return details?.error ?? 'Schedule update failed.';
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
