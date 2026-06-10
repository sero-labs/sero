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
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly host: IndexerHost) {}

  async start(): Promise<void> {
    // Snapshot BEFORE syncing: the sync normalizes in-flight statuses
    // ('building' → 'idle'), which is exactly the interrupted-work signal
    // the catch-up decisions need.
    const before = await this.host.readState();
    await this.syncWorkspaceList();
    const minutes = before?.settings.refreshIntervalMinutes ?? DEFAULT_STATE.settings.refreshIntervalMinutes;

    // Catch up only where needed — a restart must not churn fresh workspaces:
    // interrupted full builds restart full, interrupted updates resume, and
    // stale graphs (older than the refresh interval) get a cheap update.
    for (const entry of Object.values(before?.workspaces ?? {})) {
      if (!entry.enabled) continue;
      if (entry.status === 'building' || !entry.lastBuiltAt) {
        this.enqueue(entry.workspaceId, true);
      } else if (entry.status === 'updating' || entry.status === 'queued') {
        this.enqueue(entry.workspaceId, false);
      } else if (minutes > 0 && Date.now() - Date.parse(entry.lastBuiltAt) > minutes * 60_000) {
        this.enqueue(entry.workspaceId, false);
      }
    }

    if (minutes > 0) {
      this.refreshTimer = setInterval(() => void this.refreshAll(), minutes * 60_000);
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
    if (this.refreshTimer) clearInterval(this.refreshTimer);
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

  async refreshAll(): Promise<void> {
    const state = await this.host.readState();
    for (const entry of Object.values(state?.workspaces ?? {})) {
      if (entry.enabled && entry.status === 'idle') this.enqueue(entry.workspaceId, false);
    }
    this.kick();
  }

  private async syncWorkspaceList(): Promise<void> {
    const workspaces = await this.host.listWorkspaces();
    await this.host.updateState((current) => {
      const state = current ?? structuredClone(DEFAULT_STATE);
      const next = { ...state, workspaces: { ...state.workspaces } };
      for (const ws of workspaces) {
        if (ws.id === 'global') continue;
        const existing = next.workspaces[ws.id];
        next.workspaces[ws.id] = existing
          ? { ...existing, name: ws.name, path: ws.path, status: existing.status === 'error' ? 'error' : 'idle' }
          : { workspaceId: ws.id, name: ws.name, path: ws.path, enabled: false, status: 'idle' };
      }
      for (const id of Object.keys(next.workspaces)) {
        if (!workspaces.some((ws) => ws.id === id)) delete next.workspaces[id];
      }
      return next;
    });
  }

  private async applyRequest(request: IndexRequest): Promise<void> {
    const enable = async (workspaceId: string, rebuild: boolean) => {
      await this.host.updateState((state) => {
        const entry = state.workspaces[workspaceId];
        if (!entry) return state;
        return { ...state, workspaces: { ...state.workspaces, [workspaceId]: { ...entry, enabled: true, status: 'queued', lastError: undefined } } };
      });
      this.enqueue(workspaceId, rebuild);
    };

    switch (request.action) {
      case 'enable':
      case 'rebuild':
        if (request.workspaceId) await enable(request.workspaceId, true);
        break;
      case 'refresh':
        if (request.workspaceId) await enable(request.workspaceId, false);
        break;
      case 'enable-all': {
        const state = await this.host.readState();
        for (const id of Object.keys(state?.workspaces ?? {})) await enable(id, true);
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
