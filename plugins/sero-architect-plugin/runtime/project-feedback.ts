import { getOrchestratorRoomRegistry, type FeedbackSnapshotReply } from '@sero-ai/common';
import { ofProject } from '../shared/feedback';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

/**
 * The current feedback for one project: its owner and direct research from
 * this runtime, plus the Workflows and Rooms it dispatched, read from the
 * Orchestrator runtime of its workspace. Both runtimes are in one process, so
 * they share one epoch.
 */
export async function readProjectFeedback(deps: { host: Pick<ArchitectHost, 'feedback'>; store: RecordStore }, projectId: string): Promise<FeedbackSnapshotReply> {
  const own = deps.host.feedback.reply(ofProject(projectId));
  const record = await deps.store.read(projectId);
  const handle = record?.workspaceId ? getOrchestratorRoomRegistry()?.get(record.workspaceId)?.handle : undefined;
  const linked = await handle?.feedback?.().catch(() => null);
  // A linked runtime from another epoch proves nothing about now.
  const snapshots = linked && linked.epoch === own.epoch ? linked.snapshots.filter(ofProject(projectId)) : [];
  return { epoch: own.epoch, snapshots: [...own.snapshots, ...snapshots] };
}

/**
 * The same read for every project at once, for a list or a widget: this
 * runtime's own work, and the work each running Orchestrator runtime recorded
 * under a project. One read, whatever the number of rows.
 */
export async function readAllProjectFeedback(deps: { host: Pick<ArchitectHost, 'feedback'> }): Promise<FeedbackSnapshotReply> {
  const own = deps.host.feedback.reply((entry) => entry.scope.projectId !== undefined);
  const handles = [...(getOrchestratorRoomRegistry()?.values() ?? [])].map((entry) => entry.handle);
  const replies = await Promise.all(handles.map((handle) => handle.feedback?.().catch(() => null) ?? null));
  const linked = replies.flatMap((reply) => reply && reply.epoch === own.epoch ? reply.snapshots.filter((entry) => entry.scope.projectId !== undefined) : []);
  return { epoch: own.epoch, snapshots: [...own.snapshots, ...linked] };
}
