import type { OrchestratorBoardLoopView } from '@sero-ai/common';

import { settle, unblock } from '../shared/lifecycle';
import { orchestratorIndexFiles } from './dispatch-watch';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

export interface RepairOutcome {
  ok: boolean;
  text: string;
  candidates?: { id: string; title: string; status: string }[];
}

/** Reconnection requires the user to select a workflow. Never guess from its title. */
export async function repairDispatch(
  store: RecordStore, host: ArchitectHost, projectId: string, workflowId?: string,
): Promise<RepairOutcome> {
  const record = await store.read(projectId);
  if (!record?.workspaceId) return { ok: false, text: 'This project has no registered workspace.' };
  const workspaceId = record.workspaceId;
  const pending = record.milestones.filter((item) => item.pendingDispatch);
  if (pending.length !== 1 || pending[0]?.pendingDispatch?.kind !== 'workflow') {
    return { ok: false, text: 'No single disconnected workflow can be repaired here. Open the session log to check the failure.' };
  }
  const milestone = pending[0];
  const state = await host.readJson(orchestratorIndexFiles(record.folder).loops);
  const raw = typeof state === 'object' && state !== null && 'loops' in state ? state.loops : null;
  if (!Array.isArray(raw)) return { ok: false, text: 'The workflow list is unavailable. Nothing was changed. Try again when the workspace is ready.' };
  const loops = (raw as OrchestratorBoardLoopView[]).filter((loop) =>
    !record.milestones.some((item) => item.dispatch?.id === loop.id),
  );
  if (!workflowId) return {
    ok: true,
    text: loops.length ? `Choose the existing workflow for “${milestone.title}”. Reconnecting does not start a new run.`
      : 'No existing workflow was found. Nothing was restarted or deleted.',
    candidates: loops.map((loop) => ({ id: loop.id, title: loop.title, status: loop.status })),
  };
  if (!loops.some((loop) => loop.id === workflowId)) return { ok: false, text: 'That workflow is no longer available. Check again.' };
  const now = host.now();
  const written = await store.update(projectId, (fresh) => {
    const current = fresh.milestones.find((item) => item.id === milestone.id);
    if (!current?.pendingDispatch || current.dispatch || current.pendingDispatch.startedAt !== milestone.pendingDispatch?.startedAt) return null;
    const intent = current.pendingDispatch;
    const linked = settle({ ...fresh, milestones: fresh.milestones.map((item) => item.id === milestone.id ? {
      ...item, status: 'running' as const, pendingDispatch: undefined,
      dispatch: { kind: 'workflow' as const, id: workflowId, workspaceId,
        dispatchedAt: intent.startedAt, chargedUsd: 0, destination: intent.destination },
    } : item), stateLine: `Reconnected to ${milestone.title}. Checking progress.` }, now);
    // Only clear the missing-link block. Other failures still need attention.
    if (linked.blockedReason?.startsWith('dispatch state could not be confirmed after restart:')) {
      const cleared = unblock(linked, now, `user reconnected ${milestone.id} to workflow ${workflowId}`);
      return cleared.ok ? cleared.record : linked;
    }
    return linked;
  });
  return written ? { ok: true, text: 'Workflow reconnected. No new work was started.' }
    : { ok: false, text: 'The project changed while you were choosing. Check again.' };
}
