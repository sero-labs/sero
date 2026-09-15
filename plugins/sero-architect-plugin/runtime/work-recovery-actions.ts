/**
 * Preview, recovery and retry actions.
 *
 * Split from the management actions to keep each file within the 500-LOC limit.
 * These three share a subject: work that has a workspace and may need to be
 * started again, rather than the record-level controls beside them.
 */

import { requestOrchestratorAction } from '@sero-ai/common';

import { recoverDispatch } from './dispatch-link';
import type { DispatchWatch } from './dispatch-watch';
import type { ArchitectHost } from './host';
import type { OwnerServices } from './owner-actions';
import type { ProjectsOutcome } from './projects-actions';
import type { RecordStore } from './record-store';
import { repairDispatch, type RepairOutcome } from './repair-dispatch';

export interface WorkRecoveryDeps {
  host: ArchitectHost;
  store: RecordStore;
  services: OwnerServices;
  watch: DispatchWatch;
}

const refuse = (text: string): ProjectsOutcome => ({ ok: false, text });
const ok = (text: string): ProjectsOutcome => ({ ok: true, text });

/** Starts the project's dev server so the user can look at it. */
export async function previewProject(deps: WorkRecoveryDeps, projectId: string): Promise<ProjectsOutcome & { url?: string }> {
  const record = await deps.store.read(projectId);
  if (!record?.workspaceId) return refuse('This project has no workspace.');
  const command = await deps.host.detectDevServerCommand(record.folder);
  if (!command) return refuse('No preview command was found in the project workspace.');
  const server = await deps.host.startDevServer({ workspaceId: record.workspaceId,
    workspacePath: record.folder, cwdPath: record.folder, command, name: record.name, scope: 'workspace' });
  return server.url ? { ok: true, text: 'Project preview is running.', url: server.url }
    : refuse(server.reason ?? 'The preview could not start.');
}

/**
 * Reconnects work whose dispatch link was lost, or repairs one Workflow.
 *
 * A reserved dispatch is recovered first: it is the case that can be resolved
 * without guessing, because the request it was created from is on the record.
 */
export async function repairProject(deps: WorkRecoveryDeps, projectId: string, workflowId?: string): Promise<RepairOutcome> {
  const pending = await deps.store.read(projectId);
  if (pending?.milestones.some((item) => item.pendingDispatch?.request)) {
    try {
      return await recoverDispatch(deps.store, deps.services, pending)
        ? { ok: true, text: 'Workflow recovered. Checking progress.' }
        : { ok: false, text: 'Workflow recovery is waiting for the project pause, budget or decision to be resolved.' };
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
  }
  const result = await repairDispatch(deps.store, deps.host, projectId, workflowId);
  if (result.ok && workflowId) {
    deps.watch.untrack(projectId);
    const record = await deps.store.read(projectId);
    if (record) await deps.watch.track(record);
  }
  return result;
}

/** Continues an interrupted Workflow, with a new cap when the old one stopped it. */
export async function retryMilestone(
  deps: WorkRecoveryDeps,
  projectId: string,
  milestoneId: string,
  maxCostUsd?: number,
): Promise<ProjectsOutcome> {
  const record = await deps.store.read(projectId);
  const milestone = record?.milestones.find((item) => item.id === milestoneId);
  const dispatch = milestone?.dispatch;
  if (!record || !milestone || dispatch?.kind !== 'workflow' || !dispatch.failure) return refuse('This milestone has no interrupted Workflow to retry.');
  if (record.paused) return refuse('Resume the project before retrying its work.');
  if (record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd) return refuse('Raise the project cap before retrying.');
  if (record.blockedReason && record.blockedReason !== dispatch.failure) return refuse(record.blockedReason);
  if (dispatch.costLimitUsd !== undefined) {
    if (maxCostUsd === undefined || !Number.isFinite(maxCostUsd) || maxCostUsd <= dispatch.chargedUsd) return refuse('Approve a finite Workflow cap above its recorded spend.');
    const available = record.budget.capUsd === null ? 0 : Math.max(0, record.budget.capUsd - record.budget.spentUsd);
    if (maxCostUsd > dispatch.chargedUsd + available) return refuse('Raise the project cap first. This Workflow allocation exceeds the remaining project budget.');
    const changed = await requestOrchestratorAction(dispatch.workspaceId, { kind: 'use_cost_budget', loopId: dispatch.id, maxCostUsd });
    if (!changed.ok) return refuse(changed.error ?? 'The Workflow cap could not change.');
    const started = await requestOrchestratorAction(dispatch.workspaceId, { kind: 'run_next', loopId: dispatch.id });
    return started.ok ? ok(`Workflow resumed with a $${maxCostUsd} cap.`) : refuse(started.error ?? 'The Workflow could not resume.');
  }
  const result = await requestOrchestratorAction(dispatch.workspaceId, dispatch.retryStepId
    ? { kind: 'retry_step', loopId: dispatch.id, stepId: dispatch.retryStepId }
    : { kind: 'retry', loopId: dispatch.id });
  return result.ok ? ok(`Retry started for ${milestone.title}.`) : refuse(result.error ?? 'The Workflow could not retry.');
}
