import type { GraphifyState, IndexRequest, WorkspaceIndexStats, WorkspaceIndexStatus } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

export interface IndexerWorkspace {
  id: string;
  name: string;
  path: string;
  open: boolean;
}

export interface IndexerHost {
  readState(): Promise<GraphifyState | null>;
  updateState(updater: (current: GraphifyState) => GraphifyState): Promise<void>;
  listWorkspaces(): Promise<IndexerWorkspace[]>;
  ensureProvisioned(): Promise<void>;
  buildGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings'], onProgress?: (message: string) => void): Promise<WorkspaceIndexStats>;
  updateGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings'], onProgress?: (message: string) => void): Promise<WorkspaceIndexStats>;
  mergeProfileGraph(workspaceIds: string[]): Promise<{ nodes: number; edges: number }>;
  /** Delete a workspace's on-disk graph artifacts (idempotent — no-op if absent). */
  removeWorkspaceArtifacts(workspaceId: string): Promise<void>;
  /** Ids of every workspace that has graph artifacts on disk. */
  listArtifactWorkspaceIds(): Promise<string[]>;
  log(message: string): void;
}

interface Job {
  workspaceId: string;
  full: boolean;
}

export class GraphifyIndexer {
  private queue: Job[] = [];
  private current: Promise<void> = Promise.resolve();
  private processing = false;
  private disposed = false;

  constructor(private readonly host: IndexerHost) {}

  /**
   * Push model — no timers, ever. After this boot pass, work arrives only as
   * explicit requests: edit-triggered `refresh` from the extension's SDK
   * hooks, `sync` from the panel / session-start discovery, and the panel's
   * own enable/rebuild actions.
   */
  async start(): Promise<void> {
    // Snapshot BEFORE syncing: the sync normalizes in-flight statuses
    // ('building' → 'idle'), which is exactly the interrupted-work signal
    // the catch-up decisions need.
    const before = await this.host.readState();
    await this.syncWorkspaces({ normalizeStatuses: true });
    // Reclaim disk left by workspaces deleted while Sero was closed (or by
    // older builds that never cleaned up after themselves).
    await this.sweepOrphanArtifacts();

    // Boot catch-up: interrupted full builds restart full; everything else
    // enabled gets one cheap AST-only update to absorb changes made while
    // Sero was closed.
    for (const entry of Object.values(before?.workspaces ?? {})) {
      if (!entry.enabled) continue;
      this.enqueue(entry.workspaceId, entry.status === 'building' || !entry.lastBuiltAt);
    }
    this.kick();
  }

  async handleStateChange(rawState: unknown): Promise<void> {
    const state = rawState as GraphifyState | null;
    if (!state || !Array.isArray(state.requests) || state.requests.length === 0) return;
    const requests = [...state.requests];
    await this.host.updateState((current) => ({ ...current, requests: [] }));
    for (const request of requests) await this.applyRequest(request);
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Resolves when the queue drains. Test/diagnostic helper. */
  async idle(): Promise<void> {
    // The queue is processed serially on `current`; chaining awaits completion.
    let previous: Promise<void>;
    do {
      previous = this.current;
      await previous;
    } while (previous !== this.current);
  }

  /**
   * Reconcile the profile workspace list into state. Runs once at start
   * (normalizing statuses interrupted by the previous process) and then on
   * the discovery interval so new/renamed/removed workspaces show up live.
   * Skips the state write entirely when nothing changed — every write
   * broadcasts on the state bus and re-enters handleStateChange.
   */
  async syncWorkspaces(options: { normalizeStatuses?: boolean } = {}): Promise<void> {
    const normalize = options.normalizeStatuses === true;
    const workspaces = (await this.host.listWorkspaces()).filter((ws) => ws.id !== 'global');
    const current = (await this.host.readState())?.workspaces ?? {};
    const discoveredIds = new Set(workspaces.map((workspace) => workspace.id));
    const pendingEntries = Object.values(current).filter(
      (entry) => entry.pendingHostDiscovery && !discoveredIds.has(entry.workspaceId),
    );

    // Outside start(), live statuses (queued/building/updating) must survive a
    // discovery tick; only the boot pass may normalize interrupted work to idle.
    const nextStatus = (existing: GraphifyState['workspaces'][string]): WorkspaceIndexStatus =>
      normalize ? (existing.status === 'error' ? 'error' : 'idle') : existing.status;

    const unchanged = workspaces.length + pendingEntries.length === Object.keys(current).length
      && workspaces.every((ws) => {
        const existing = current[ws.id];
        return existing
          && !existing.pendingHostDiscovery
          && existing.name === ws.name
          && existing.path === ws.path
          && existing.status === nextStatus(existing);
      })
      && pendingEntries.every((entry) => entry.status === nextStatus(entry));
    if (unchanged) return;

    const removedIds = Object.keys(current).filter((id) => (
      !discoveredIds.has(id) && !current[id]?.pendingHostDiscovery
    ));
    const removedIndexed = removedIds.some((id) => current[id]?.enabled && current[id]?.lastBuiltAt);

    await this.host.updateState((raw) => {
      const state = raw ?? structuredClone(DEFAULT_STATE);
      const next = { ...state, workspaces: { ...state.workspaces } };
      for (const ws of workspaces) {
        const existing = next.workspaces[ws.id];
        if (!existing) {
          next.workspaces[ws.id] = {
            workspaceId: ws.id,
            name: ws.name,
            path: ws.path,
            enabled: false,
            status: 'idle',
          };
          continue;
        }
        const observed = { ...existing };
        delete observed.pendingHostDiscovery;
        next.workspaces[ws.id] = {
          ...observed,
          name: ws.name,
          path: ws.path,
          status: nextStatus(existing),
        };
      }
      for (const id of Object.keys(next.workspaces)) {
        if (!discoveredIds.has(id) && !next.workspaces[id].pendingHostDiscovery) {
          delete next.workspaces[id];
        }
      }
      return next;
    });
    // A removed workspace's per-workspace graph is now an orphan — delete it so
    // disk tracks the live workspace list (disable keeps artifacts; removal does not).
    // Removals are independent, so run them together.
    await Promise.all(removedIds.map((id) => this.host.removeWorkspaceArtifacts(id)));
    // A deleted workspace that was part of the profile graph leaves stale
    // nodes behind until the next merge — re-merge promptly.
    if (removedIndexed) await this.merge();
  }

  /**
   * Delete graph artifacts whose workspace no longer exists in the profile.
   * Reactive removal (above) handles workspaces that vanish while running;
   * this catches artifacts already orphaned on disk at boot. Disabled-but-present
   * workspaces are safe: listWorkspaces() still returns them, so they are never
   * mistaken for orphans.
   */
  private async sweepOrphanArtifacts(): Promise<void> {
    const state = await this.host.readState();
    const live = new Set((await this.host.listWorkspaces()).map((ws) => ws.id));
    for (const entry of Object.values(state?.workspaces ?? {})) {
      if (entry.pendingHostDiscovery) live.add(entry.workspaceId);
    }
    const orphans = (await this.host.listArtifactWorkspaceIds()).filter((id) => !live.has(id));
    await Promise.all(orphans.map((id) => {
      this.host.log(`[graphify] removing orphaned graph artifacts for ${id}`);
      return this.host.removeWorkspaceArtifacts(id);
    }));
  }

  private async applyRequest(request: IndexRequest): Promise<void> {
    const enable = async (request: IndexRequest, rebuild: boolean) => {
      const workspaceId = request.workspaceId;
      if (!workspaceId) return;
      let shouldEnqueue = false;
      let missingMessage: string | null = null;
      await this.host.updateState((state) => {
        const existing = state.workspaces[workspaceId];
        if (!existing && (!request.workspaceName || !request.workspacePath)) {
          missingMessage = 'Workspace is not available. Sync Graphify and enable indexing again.';
          return state;
        }
        const entry = existing
          ? {
              ...existing,
              name: request.workspaceName ?? existing.name,
              path: request.workspacePath ?? existing.path,
            }
          : {
              workspaceId,
              name: request.workspaceName!,
              path: request.workspacePath!,
              enabled: false,
              status: 'idle' as const,
              pendingHostDiscovery: true,
            };
        shouldEnqueue = true;
        return {
          ...state,
          workspaces: {
            ...state.workspaces,
            [workspaceId]: {
              ...entry,
              enabled: true,
              status: 'queued',
              lastError: undefined,
            },
          },
        };
      });
      if (shouldEnqueue) this.enqueue(workspaceId, rebuild);
      else if (missingMessage) this.host.log(`[graphify] ${workspaceId}: ${missingMessage}`);
    };

    switch (request.action) {
      case 'enable':
      case 'rebuild':
        await enable(request, true);
        break;
      case 'refresh': {
        // Refresh is the push-update path (edit hooks, panel). It must never
        // resurrect a workspace the user disabled.
        if (!request.workspaceId) break;
        const state = await this.host.readState();
        if (state?.workspaces[request.workspaceId]?.enabled) await enable(request, false);
        break;
      }
      case 'sync':
        await this.syncWorkspaces();
        break;
      case 'enable-all': {
        const state = await this.host.readState();
        for (const id of Object.keys(state?.workspaces ?? {})) {
          await enable({ ...request, workspaceId: id }, true);
        }
        break;
      }
      case 'disable':
        if (request.workspaceId) {
          this.queue = this.queue.filter((job) => job.workspaceId !== request.workspaceId);
          await this.host.updateState((state) => {
            const entry = state.workspaces[request.workspaceId!];
            if (!entry) return state;
            return { ...state, workspaces: { ...state.workspaces, [request.workspaceId!]: { ...entry, enabled: false, status: 'idle' } } };
          });
          await this.merge();
        }
        break;
    }
  }

  private enqueue(workspaceId: string, full: boolean): void {
    const existing = this.queue.find((job) => job.workspaceId === workspaceId);
    if (existing) {
      existing.full = existing.full || full;
      return;
    }
    this.queue.push({ workspaceId, full });
  }

  private kick(): void {
    if (this.processing || this.disposed) return;
    this.processing = true;
    this.current = this.current.then(async () => {
      try {
        while (this.queue.length > 0 && !this.disposed) {
          const job = this.queue.shift()!;
          await this.runJob(job);
        }
      } finally {
        this.processing = false;
      }
    });
  }

  private async setStatus(workspaceId: string, status: WorkspaceIndexStatus, patch: Partial<GraphifyState['workspaces'][string]> = {}): Promise<void> {
    await this.host.updateState((state) => {
      const entry = state.workspaces[workspaceId];
      if (!entry) return state;
      return { ...state, workspaces: { ...state.workspaces, [workspaceId]: { ...entry, ...patch, status } } };
    });
  }

  private async runJob(job: Job): Promise<void> {
    const state = await this.host.readState();
    const entry = state?.workspaces[job.workspaceId];
    if (!state || !entry?.enabled) return;

    const runningStatus: WorkspaceIndexStatus = job.full ? 'building' : 'updating';
    await this.setStatus(job.workspaceId, runningStatus, { progress: 'Starting…' });

    // Throttled progress → state writes; the UI observes via the state bus.
    let lastWrite = 0;
    let lastMessage = '';
    const onProgress = (message: string) => {
      const trimmed = message.trim().slice(0, 300);
      if (!trimmed || trimmed === lastMessage) return;
      const now = Date.now();
      if (now - lastWrite < 750) return;
      lastWrite = now;
      lastMessage = trimmed;
      void this.setStatus(job.workspaceId, runningStatus, { progress: trimmed });
    };

    try {
      await this.host.ensureProvisioned();
      const target = { workspaceId: entry.workspaceId, path: entry.path };
      const fresh = job.full
        ? await this.host.buildGraph(target, state.settings, onProgress)
        : await this.host.updateGraph(target, state.settings, onProgress);
      // Incremental updates never spend LLM tokens; keep the last build's cost visible.
      const stats: WorkspaceIndexStats = {
        ...fresh,
        inputTokens: fresh.inputTokens || entry.stats?.inputTokens || 0,
        outputTokens: fresh.outputTokens || entry.stats?.outputTokens || 0,
      };
      await this.setStatus(job.workspaceId, 'idle', { stats, lastBuiltAt: new Date().toISOString(), lastError: undefined, progress: undefined });
      await this.merge();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.log(`[graphify] build failed for ${job.workspaceId}: ${message}`);
      await this.setStatus(job.workspaceId, 'error', { lastError: message, progress: undefined });
    }
  }

  private async merge(): Promise<void> {
    const state = await this.host.readState();
    const ids = Object.values(state?.workspaces ?? {})
      .filter((entry) => entry.enabled && entry.lastBuiltAt)
      .map((entry) => entry.workspaceId);

    if (ids.length === 0) {
      await this.host.updateState((current) => ({ ...current, profileGraph: { status: 'absent' } }));
      return;
    }
    await this.host.updateState((current) => ({ ...current, profileGraph: { ...current.profileGraph, status: 'merging' } }));
    try {
      const { nodes, edges } = await this.host.mergeProfileGraph(ids);
      await this.host.updateState((current) => ({
        ...current,
        profileGraph: { status: 'ready', mergedAt: new Date().toISOString(), nodes, edges, workspaceIds: ids },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.host.updateState((current) => ({ ...current, profileGraph: { ...current.profileGraph, status: 'failed', error: message } }));
    }
  }
}
