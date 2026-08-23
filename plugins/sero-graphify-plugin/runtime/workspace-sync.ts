import type { GraphifyNotice, GraphifyState, WorkspaceIndexStatus } from '../shared/types';
import { DEFAULT_STATE, isIndexableWorkspace } from '../shared/types';
import type { IndexerHost } from './indexer';

/**
 * Reconciling the profile's workspace list into graphify state.
 *
 * Split out of the indexer so the queue file stays about queueing, and because
 * removal destroys generated graph data, so it deserves to be read on its own.
 */

function isIndexing(status: WorkspaceIndexStatus): boolean {
  return status === 'queued' || status === 'building' || status === 'updating';
}

export interface SyncResult {
  /** Ids dropped from state, whose artifacts the caller should remove. */
  removedIds: string[];
  /** True when a removed workspace had a built graph, so the merge is stale. */
  removedIndexed: boolean;
}

export async function syncWorkspaceList(
  host: IndexerHost,
  options: { normalizeStatuses?: boolean } = {},
): Promise<SyncResult> {
  const normalize = options.normalizeStatuses === true;
  const discovered = await host.listWorkspaces();
  const current = (await host.readState())?.workspaces ?? {};

  // An empty listing means "cannot see the workspaces", never "every workspace
  // was deleted". The host's registry loader falls back to an empty list when
  // workspaces.json is unreadable, and acting on that would drop every state
  // entry and delete every generated graph.
  if (discovered.length === 0 && Object.keys(current).length > 0) {
    host.log('[graphify] workspace list came back empty; keeping existing entries rather than treating them as removed');
    return { removedIds: [], removedIndexed: false };
  }

  const workspaces = discovered.filter((ws) => isIndexableWorkspace(ws.id));
  const discoveredIds = new Set(workspaces.map((workspace) => workspace.id));

  // Only the boot pass may normalise interrupted work, and `needs-build`
  // survives it: it is a decision waiting for the user, not a stale status.
  const nextStatus = (existing: GraphifyState['workspaces'][string]): WorkspaceIndexStatus => {
    if (!normalize) return existing.status;
    if (existing.status === 'error' || existing.status === 'needs-build') return existing.status;
    return 'idle';
  };

  const unchanged = workspaces.length === Object.keys(current).length
    && workspaces.every((ws) => {
      const existing = current[ws.id];
      return existing && existing.name === ws.name && existing.path === ws.path && existing.status === nextStatus(existing);
    });
  if (unchanged) return { removedIds: [], removedIndexed: false };

  const removalCandidates = Object.keys(current).filter((id) => !discoveredIds.has(id));

  await host.updateState((raw) => {
    const state = raw ?? structuredClone(DEFAULT_STATE);
    const next = { ...state, workspaces: { ...state.workspaces } };
    for (const ws of workspaces) {
      const existing = next.workspaces[ws.id];
      next.workspaces[ws.id] = existing
        ? { ...existing, name: ws.name, path: ws.path, status: nextStatus(existing) }
        : { workspaceId: ws.id, name: ws.name, path: ws.path, enabled: false, status: 'idle' };
    }
    for (const id of Object.keys(next.workspaces)) {
      let entry = next.workspaces[id];
      const status = nextStatus(entry);
      if (status !== entry.status) {
        entry = { ...entry, status };
        delete entry.progress;
        next.workspaces[id] = entry;
      }
      if (!discoveredIds.has(id) && !isIndexing(entry.status)) delete next.workspaces[id];
    }
    return next;
  });

  const reconciled = (await host.readState())?.workspaces ?? {};
  const removedIds = removalCandidates.filter((id) => !reconciled[id]);
  const removedIndexed = removedIds.some((id) => current[id]?.lastBuiltAt);

  if (removedIds.length > 0) await recordRemovals(host, removedIds, current);
  await Promise.all(removedIds.map((id) => {
    host.log(`[graphify] removing undiscovered workspace ${id} and its graph artifacts`);
    return host.removeWorkspaceArtifacts(id);
  }));

  return { removedIds, removedIndexed };
}

/**
 * Keep a short record of built graphs whose workspace was removed.
 */
async function recordRemovals(
  host: IndexerHost,
  removedIds: string[],
  previous: GraphifyState['workspaces'],
): Promise<void> {
  const built = removedIds.filter((id) => previous[id]?.lastBuiltAt);
  if (built.length === 0) return;
  const removedAt = new Date().toISOString();
  await host.updateState((state) => ({
    ...state,
    removedWorkspaces: [
      ...state.removedWorkspaces,
      ...built.map((id) => ({ workspaceId: id, name: previous[id].name, removedAt, stats: previous[id].stats })),
    ].slice(-20),
  }));
  const names = built.map((id) => previous[id].name).join(', ');
  const message = `${names} was removed from the profile. Its knowledge graph is gone; enable it again to rebuild the local index.`;
  host.notify({ kind: 'info', message, at: removedAt } satisfies GraphifyNotice);
}

/** Delete graph artifacts whose workspace no longer exists in the profile. */
export async function sweepOrphanArtifacts(host: IndexerHost): Promise<void> {
  const discovered = await host.listWorkspaces();
  const artifacts = await host.listArtifactWorkspaceIds();
  // Same rule as the sync: with no visible workspaces every graph looks like an
  // orphan, and deleting them all is unrecoverable.
  if (discovered.length === 0 && artifacts.length > 0) {
    host.log('[graphify] workspace list came back empty; leaving graph artifacts alone');
    return;
  }
  const live = new Set(discovered.map((ws) => ws.id));
  const orphans = artifacts.filter((id) => !live.has(id));
  await Promise.all(orphans.map((id) => {
    host.log(`[graphify] removing orphaned graph artifacts for ${id}`);
    return host.removeWorkspaceArtifacts(id);
  }));
}
