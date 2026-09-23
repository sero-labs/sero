/**
 * The one step that links a project to a workspace, serialized per runtime.
 *
 * Intake is re-entrant: it records the destination as the project's folder,
 * then creates the workspace, then saves its id. If the record update is lost,
 * a resume must adopt the workspace already at that folder rather than make a
 * suffixed sibling. Without a lock, two new-folder intakes can interleave: the
 * second reads ownership before the first saves its id and adopts its
 * workspace. One queue per runtime closes that window, on the `RecordStore`
 * write-queue precedent.
 */

import path from 'node:path';

import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

export function createWorkspaceClaim(
  host: ArchitectHost,
  store: RecordStore,
): (projectId: string) => Promise<ProjectRecord> {
  let queue: Promise<unknown> = Promise.resolve();

  return (projectId) => {
    const claim = async (): Promise<ProjectRecord> => {
      const record = await store.read(projectId);
      if (!record) throw new Error(`No project ${projectId}.`);
      // A second call for the same project sees the first call's saved id.
      if (record.workspaceId) return record;

      const owned = new Set((await store.list()).filter((project) => project.id !== record.id).map((project) => project.workspaceId));
      // Adopt a workspace already at the record's folder, unless another
      // project owns it: that one belongs to the intake that made it.
      const existing = (await host.listWorkspaces()).find((workspace) => workspace.path === record.folder && !owned.has(workspace.id));
      const workspace = existing ?? await host.createWorkspace(record.name, path.dirname(record.folder));
      const saved = await store.update(record.id, (fresh) => ({
        ...fresh, folder: workspace.path, workspaceId: workspace.id, stateLine: 'Workspace ready. Permission is needed to run the Architect.',
      }));
      if (!saved) throw new Error(`No project ${projectId}.`);
      return saved;
    };

    // Keep the queue alive after a failure while still rejecting the caller.
    const next = queue.then(claim, claim);
    queue = next.catch(() => undefined);
    return next;
  };
}
