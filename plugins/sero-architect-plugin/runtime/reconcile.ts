/**
 * Restart reconciliation. Runs before any wake: every record is re-settled so
 * a cap used while Sero was closed comes back `limited`, a record whose
 * workspace no longer exists is held as `blocked` rather than resumed, and the
 * index is rebuilt from the records on disk.
 */

import { block, settle } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

export interface ReconcileResult {
  records: ProjectRecord[];
  /** Project ids held because their state could not be confirmed. */
  held: string[];
}

/**
 * Drops every dispatch's observed-liveness stamp.
 *
 * The stamp means "this runtime session watched that work report". A session
 * that has just started has watched nothing, so keeping a saved stamp would let
 * a dead Workflow read as Working, which is the fault this exists to prevent.
 */
function clearObservedLiveness(record: ProjectRecord): ProjectRecord {
  if (!record.milestones.some((milestone) => milestone.dispatch?.observedLiveAt)) return record;
  return {
    ...record,
    milestones: record.milestones.map((milestone) => {
      if (!milestone.dispatch?.observedLiveAt) return milestone;
      const { observedLiveAt: _dropped, ...dispatch } = milestone.dispatch;
      return { ...milestone, dispatch };
    }),
  };
}

export async function reconcileProjects(store: RecordStore, host: ArchitectHost): Promise<ReconcileResult> {
  const now = host.now();
  const workspaceIds = new Set((await host.listWorkspaces()).map((ws) => ws.id));
  const held: string[] = [];
  const records: ProjectRecord[] = [];

  for (const stored of await store.list()) {
    let record = settle(clearObservedLiveness({ ...stored, session: { ...stored.session, workingSince: null } }), now);
    const workspaceMissing = record.workspaceId !== null && !workspaceIds.has(record.workspaceId);
    if (workspaceMissing && record.blockedReason === null) {
      const blocked = block(record, now, `workspace ${record.workspaceId} is not registered in this profile`);
      if (blocked.ok) record = blocked.record;
      held.push(record.id);
    }
    if (record.overlay !== stored.overlay) {
      host.log(`project ${record.id} comes back ${record.overlay ?? 'clear'} after restart`);
    }
    records.push(record);
    await store.write(record);
  }

  await store.rebuildIndex();
  return { records, held };
}
