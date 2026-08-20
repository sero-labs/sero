import type {
  GraphifyNotice,
  GraphifyState,
  IndexRequest,
  WorkspaceIndexStats,
  WorkspaceIndexStatus,
} from '../shared/types';
import { isIndexableWorkspace } from '../shared/types';
import { authorizePaidBuild, type SpendHost } from './spend-guard';
import { settleRun } from '../shared/ledger';
import { reserveEstimate, settleStats } from './spend-record';
import { sweepOrphanArtifacts, syncWorkspaceList } from './workspace-sync';
import { applySettingsPatch, upgradeGraphifyTool } from './settings';

export interface IndexerWorkspace {
  id: string;
  name: string;
  path: string;
  open: boolean;
}

export interface IndexerHost extends SpendHost {
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
  /** True when a built graph is already on disk — the difference between free and paid. */
  graphExists(workspaceId: string): Promise<boolean>;
  /** graphifyy version currently installed, recorded against each build. */
  graphifyVersion(): Promise<string | undefined>;
  /** Install a specific graphifyy version. Always a user-approved action. */
  upgradeGraphify(version: string): Promise<void>;
  /** Surface something the user must see. */
  notify(notice: GraphifyNotice): void;
  log(message: string): void;
}

interface Job {
  workspaceId: string;
  /** True when this job may call the LLM. Free AST updates set it false. */
  paid: boolean;
  /** Ask before spending, even when the estimate is inside every cap. */
  confirm: boolean;
}

function notice(kind: GraphifyNotice['kind'], message: string): GraphifyNotice {
  return { kind, message, at: new Date().toISOString() };
}

export class GraphifyIndexer {
  private queue: Job[] = [];
  private current: Promise<void> = Promise.resolve();
  private processing = false;
  private disposed = false;
  /** The job running right now, so a repeat request cannot queue a second one. */
  private activeJob: Job | null = null;
  private rerunRequested = false;
  /**
   * Highest request id this process has applied.
   *
   * The authority is here, not in the file. The extension appends requests from
   * its own process, so a write of its own can land on top of one of ours and
   * carry an older watermark back — which would make an already-drained request
   * eligible again, and a paid rebuild run twice. An in-memory high-water mark
   * cannot be rolled back by another process.
   */
  private appliedWatermark = 0;

  constructor(private readonly host: IndexerHost) {}

  /**
   * Push model — no timers, ever. Work arrives as explicit requests: edit
   * hooks, the panel, and session-start discovery.
   *
   * A restart never spends. An enabled workspace with a graph on disk gets the
   * free AST update; one without a graph is marked `needs-build` and waits for
   * the user. The old rule restarted a full build for any workspace with no
   * `lastBuiltAt` — which every failed build has, so a build that failed was
   * paid for again at every launch.
   */
  async start(): Promise<void> {
    const before = await this.host.readState();
    this.appliedWatermark = before?.lastAppliedRequestId ?? 0;
    await this.syncWorkspaces({ normalizeStatuses: true });
    await sweepOrphanArtifacts(this.host);

    for (const entry of Object.values(before?.workspaces ?? {})) {
      if (!entry.enabled || !isIndexableWorkspace(entry.workspaceId)) continue;
      if (await this.host.graphExists(entry.workspaceId)) {
        this.enqueue({ workspaceId: entry.workspaceId, paid: false, confirm: false });
      } else {
        await this.setStatus(entry.workspaceId, 'needs-build', { progress: undefined });
      }
    }
    this.kick();
  }

  /**
   * Drain the request list.
   *
   * The read and the clear happen inside ONE `updateState` callback, which the
   * host runs inside its serialised write queue. Separate steps left a window
   * in which a repeated file-watcher delivery — the watcher fires on both the
   * rename and the change of an atomic write — read the same request twice and
   * queued a second full build. `lastAppliedRequestId` closes the same hole
   * across processes.
   */
  async handleStateChange(rawState: unknown): Promise<void> {
    const incoming = rawState as GraphifyState | null;
    if (!incoming || !Array.isArray(incoming.requests) || incoming.requests.length === 0) return;

    let pending: IndexRequest[] = [];
    await this.host.updateState((current) => {
      // Whichever is further ahead wins, so a rolled-back file cannot resurrect
      // a request this process already applied.
      const watermark = Math.max(this.appliedWatermark, current.lastAppliedRequestId ?? 0);
      pending = (current.requests ?? []).filter((request) => request.id > watermark);
      const highest = (current.requests ?? []).reduce((max, request) => Math.max(max, request.id), watermark);
      this.appliedWatermark = highest;
      return { ...current, requests: [], lastAppliedRequestId: highest };
    });

    // The clear and the watermark advance happen BEFORE the requests are
    // applied, so a repeated delivery can never re-apply them. A request lost
    // to a crash costs the user another click; a request applied twice costs
    // them another build. Each is applied on its own so one failure does not
    // discard the rest of the batch.
    for (const request of pending) {
      try {
        await this.applyRequest(request);
      } catch (error) {
        this.host.log(`[graphify] request #${request.id} (${request.action}) failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Resolves when the queue drains. Test/diagnostic helper. */
  async idle(): Promise<void> {
    let previous: Promise<void>;
    do {
      previous = this.current;
      await previous;
    } while (previous !== this.current);
  }

  /** Reconcile the profile workspace list into state. */
  async syncWorkspaces(options: { normalizeStatuses?: boolean } = {}): Promise<void> {
    const { removedIndexed } = await syncWorkspaceList(this.host, options);
    if (removedIndexed) await this.merge();
  }

  /**
   * Turn indexing on for a workspace the host registry actually knows.
   *
   * The registry check is the guard: the old code built any workspace a caller
   * named, including one discovery had never seen, and the next sync then
   * deleted the graph that had just been paid for.
   */
  private async enable(workspaceId: string, options: { rebuild: boolean }): Promise<void> {
    if (!isIndexableWorkspace(workspaceId)) {
      this.host.notify(notice('refused', `${workspaceId} is not indexable. The global workspace holds your memory store, which is dense prose and expensive to index.`));
      return;
    }
    const known = (await this.host.listWorkspaces()).some((ws) => ws.id === workspaceId);
    if (!known) {
      this.host.notify(notice('refused', `Graphify does not know a workspace called ${workspaceId}, so it will not index it. Sync Graphify and try again.`));
      return;
    }
    // A workspace-creation contribution fires the moment Sero creates the
    // workspace, before discovery has seen it. The registry already knows it,
    // so one sync is enough — and it keeps name and path host-owned rather
    // than taking them from the caller.
    if (!(await this.host.readState())?.workspaces[workspaceId]) await this.syncWorkspaces();

    const hasGraph = await this.host.graphExists(workspaceId);
    const paid = options.rebuild || !hasGraph;
    await this.host.updateState((state) => {
      const entry = state.workspaces[workspaceId];
      if (!entry) return state;
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [workspaceId]: { ...entry, enabled: true, status: paid ? 'queued' : entry.status, lastError: undefined },
        },
      };
    });

    // Enabling a workspace that already has a graph costs nothing: it joins the
    // profile merge as it is. Only an explicit rebuild spends again.
    if (!paid) {
      await this.merge();
      return;
    }
    this.enqueue({ workspaceId, paid: true, confirm: true });
  }

  private async applyRequest(request: IndexRequest): Promise<void> {
    switch (request.action) {
      case 'enable':
        if (request.workspaceId) await this.enable(request.workspaceId, { rebuild: false });
        break;
      case 'rebuild':
        if (request.workspaceId) await this.enable(request.workspaceId, { rebuild: true });
        break;
      case 'refresh': {
        // The push-update path (edit hooks, panel). Free, and it must never
        // resurrect a workspace the user disabled or build one that has no graph.
        if (!request.workspaceId) break;
        const state = await this.host.readState();
        const entry = state?.workspaces[request.workspaceId];
        if (entry?.enabled && await this.host.graphExists(request.workspaceId)) {
          this.enqueue({ workspaceId: request.workspaceId, paid: false, confirm: false });
        }
        break;
      }
      case 'sync':
        await this.syncWorkspaces();
        break;
      case 'upgrade':
        await upgradeGraphifyTool(this.host);
        break;
      case 'settings':
        await applySettingsPatch(this.host, request.settings ?? {});
        // Pausing must stop work already queued, not only work yet to be asked for.
        if (request.settings?.paused === true) this.dropQueuedPaidJobs();
        break;
      case 'enable-all': {
        const state = await this.host.readState();
        for (const id of Object.keys(state?.workspaces ?? {})) {
          await this.enable(id, { rebuild: false });
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

  private dropQueuedPaidJobs(): void {
    this.queue = this.queue.filter((job) => !job.paid);
  }

  /**
   * Queue a job, or fold it into one already queued or running.
   *
   * Folding into the *running* job is the part that matters: the old queue only
   * de-duplicated against jobs still waiting, so a second request for a
   * workspace already building appended a second build that ran the moment the
   * first finished.
   */
  private enqueue(job: Job): void {
    if (this.activeJob?.workspaceId === job.workspaceId) {
      if (job.paid && !this.activeJob.paid) this.rerunRequested = true;
      return;
    }
    const existing = this.queue.find((queued) => queued.workspaceId === job.workspaceId);
    if (existing) {
      existing.paid = existing.paid || job.paid;
      existing.confirm = existing.confirm || job.confirm;
      return;
    }
    this.queue.push({ ...job });
  }

  private kick(): void {
    if (this.processing || this.disposed) return;
    this.processing = true;
    this.current = this.current.then(async () => {
      try {
        while (this.queue.length > 0 && !this.disposed) {
          const job = this.queue.shift()!;
          this.activeJob = job;
          this.rerunRequested = false;
          try {
            await this.runJob(job);
          } finally {
            const rerun = this.rerunRequested;
            this.activeJob = null;
            this.rerunRequested = false;
            if (rerun) this.enqueue({ ...job, paid: true, confirm: true });
          }
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

  private async refuse(workspaceId: string, decision: { kind: string; reason: string }): Promise<void> {
    const kind = decision.kind === 'declined' ? 'declined' : decision.kind === 'cap' ? 'cap' : 'refused';
    this.host.log(`[graphify] ${workspaceId}: ${decision.reason}`);
    await this.host.updateState((state) => ({ ...state, notice: notice(kind as GraphifyNotice['kind'], decision.reason) }));
    this.host.notify(notice(kind as GraphifyNotice['kind'], decision.reason));
    // A refused build waits for the user and never retries. A refused *rebuild*
    // still has its graph, so it stays indexed — calling it "not built" would
    // misdescribe a workspace that is perfectly usable.
    const status: WorkspaceIndexStatus = await this.host.graphExists(workspaceId) ? 'idle' : 'needs-build';
    await this.setStatus(workspaceId, status, { progress: undefined });
    // One refusal is the answer for the whole batch: a cap or a pause applies
    // to every queued build, and re-asking per workspace is just noise.
    if (decision.kind === 'cap' || decision.kind === 'paused') this.dropQueuedPaidJobs();
  }

  private async runJob(job: Job): Promise<void> {
    const state = await this.host.readState();
    const entry = state?.workspaces[job.workspaceId];
    if (!state || !entry?.enabled) return;

    const runningStatus: WorkspaceIndexStatus = job.paid ? 'building' : 'updating';
    const startedAt = new Date().toISOString();
    let reservationId: string | null = null;

    if (job.paid) {
      const decision = await authorizePaidBuild(this.host, state, entry, { alwaysConfirm: job.confirm, now: new Date() });
      if (!decision.allowed) {
        await this.refuse(job.workspaceId, decision);
        return;
      }
      this.host.log(`[graphify] ${entry.name}: building — ${decision.estimate.files} files, ~${decision.estimate.estimatedInputTokens} tokens, model ${state.settings.model?.modelId}`);
      // Debited before the process starts. An extraction that consumes tokens
      // and then exits non-zero reports nothing, so a ledger written only on
      // success would let a failing workspace be retried all day against a cap
      // that still reads $0.
      reservationId = await reserveEstimate(this.host, job.workspaceId, state.settings, decision.estimate, startedAt);
    }
    await this.setStatus(job.workspaceId, runningStatus, {
      progress: 'Starting…',
      lastAttemptAt: startedAt,
      ...(job.paid ? { lastPaidAttemptAt: startedAt } : {}),
    });

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
      const fresh = job.paid
        ? await this.host.buildGraph(target, state.settings, onProgress)
        : await this.host.updateGraph(target, state.settings, onProgress);
      await this.completeJob(job, state, fresh, entry.stats, reservationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.log(`[graphify] build failed for ${job.workspaceId}: ${message}`);
      await this.setStatus(job.workspaceId, 'error', {
        lastError: message,
        progress: undefined,
        failureCount: (entry.failureCount ?? 0) + 1,
      });
      // The reservation is deliberately left standing: the build may well have
      // spent tokens before it failed, and the day's cap must reflect that.
      // No automatic retry, here or at the next start.
      this.host.notify(notice('refused', `Indexing ${entry.name} failed: ${message}`));
    }
  }

  private async completeJob(
    job: Job,
    state: GraphifyState,
    fresh: WorkspaceIndexStats,
    previous: WorkspaceIndexStats | undefined,
    reservationId: string | null,
  ): Promise<void> {
    const choice = state.settings.model;
    const { stats, inputTokens, outputTokens, spentUsd } = settleStats(
      job.paid, state.settings, fresh, previous, await this.host.graphifyVersion(),
    );

    await this.host.updateState((current) => {
      const entry = current.workspaces[job.workspaceId];
      if (!entry) return current;
      const next: GraphifyState = {
        ...current,
        workspaces: {
          ...current.workspaces,
          [job.workspaceId]: {
            ...entry,
            status: 'idle',
            stats,
            lastBuiltAt: new Date().toISOString(),
            lastError: undefined,
            progress: undefined,
            failureCount: 0,
          },
        },
      };
      if (!job.paid || !choice || !reservationId) return next;
      // Settle the reservation against measured usage. An unpriced model
      // settles at zero: it cannot be held to the daily cap — which is why it
      // always asks first — but the build stays in the day's record.
      return {
        ...next,
        spend: settleRun(current.spend, reservationId, { inputTokens, outputTokens, usd: spentUsd ?? 0 }),
      };
    });
    await this.merge();
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
