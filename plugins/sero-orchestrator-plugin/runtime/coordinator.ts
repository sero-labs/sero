// The workspace coordinator — the single executor (00-architecture.md, D-01).
//
// It owns the control plane (create/list/show/pause/resume/stop) and delegates
// attempt execution to the AttemptEngine (the loop state machine, locks, stop
// rules, budgets). Only the runtime holds `host.*`, so keeping every state write
// here (and in the modules it composes) preserves the single-executor invariant:
// tools/UI/CLI only ever call `requestAction`.
//
// Phase 2 builds the machine around attempt execution; the actual change is
// delegated to an adapter that does not exist until Phase 3/4, so `run_next`
// returns a truthful "not yet" until one is registered.

import { randomUUID } from 'node:crypto';
import type { AppRuntimeHost } from '@sero-ai/common';

import type { OrchestratorCoordinator } from '../shared/registry';
import {
  DEFAULT_LOG_POLICY,
  DEFAULT_STOP_RULE,
  type ActionSource,
  type CreateLoopInput,
  type LoopGoal,
  type LoopStatus,
  type OrchestratorAction,
  type OrchestratorActionResult,
} from '../shared/types';
import {
  MapAdapterRegistry,
  type AdapterRegistry,
} from './adapter';
import { createActiveSessionAdapter } from './adapters/active-session';
import { createBackgroundWorkerAdapter } from './adapters/background-worker';
import { CronAlarm, createSystemTimer, type AlarmTimer } from './alarm';
import { WorkerSessionRegistry } from './recursion-guard';
import { isoNow, systemClock, type Clock } from './clock';
import { diagnoseSession } from './diagnostics';
import { AttemptEngine } from './engine';
import { EventRouter } from './events';
import {
  DEFAULT_WORKSPACE_CONCURRENCY,
  LoopLocks,
  Semaphore,
} from './locks';
import {
  Scheduler,
  type CatchUpReport,
  type SchedulerLog,
} from './scheduler';
import { StateStore } from './state-store';
import { createDefaultDirtyRootGate, type DirtyRootGate } from './vcs';

const TERMINAL: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['complete', 'stopped']);

export interface CoordinatorContext {
  host: AppRuntimeHost;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
  /** Execution adapters; Phase 3/4 register real ones. Empty → `run_next` = "not yet". */
  adapters?: AdapterRegistry;
  /** Dirty-root decision seam; defaults to notify + auto-save-on-timeout (D-07). */
  dirtyRootGate?: DirtyRootGate;
  /** Injected clock for deterministic time in tests; defaults to `Date.now`. */
  clock?: Clock;
  /** Concurrent-attempt cap across loops in this workspace (D-11). */
  maxConcurrentAttempts?: number;
  /** Catch-up-on-open / live-tick / event log seam; defaults to a console logger. */
  schedulerLog?: SchedulerLog;
  /** Cron-alarm timer seam; defaults to `setTimeout` (tests inject a fake). */
  alarmTimer?: AlarmTimer;
}

export class WorkspaceCoordinator implements OrchestratorCoordinator {
  private readonly store: StateStore;
  private readonly clock: Clock;
  private readonly engine: AttemptEngine;
  private readonly scheduler: Scheduler;
  /** Smart cron alarm: one timer for the next due moment (Phase 5). */
  private readonly cronAlarm: CronAlarm;
  /** Event-trigger router: session subscriptions mark loops due (Phase 5). */
  private readonly eventRouter: EventRouter;
  /** Tracks in-flight worker parent sessions for the recursion guard (D-16). */
  private readonly workerSessions = new WorkerSessionRegistry();

  constructor(private readonly ctx: CoordinatorContext) {
    this.clock = ctx.clock ?? systemClock;
    this.store = new StateStore(ctx.host, ctx.stateFilePath);
    this.engine = new AttemptEngine({
      host: ctx.host,
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
      stateFilePath: ctx.stateFilePath,
      store: this.store,
      locks: new LoopLocks(),
      semaphore: new Semaphore(ctx.maxConcurrentAttempts ?? DEFAULT_WORKSPACE_CONCURRENCY),
      // Production wires the real adapters (background-worker → Phase 3,
      // active-session → Phase 4); tests inject their own. An empty injected
      // registry keeps `run_next` at "not yet". Both adapters share the one
      // worker-session registry so the recursion guard covers either path (D-16).
      adapters:
        ctx.adapters ??
        new MapAdapterRegistry([
          createBackgroundWorkerAdapter({ workerSessions: this.workerSessions }),
          createActiveSessionAdapter({ workerSessions: this.workerSessions }),
        ]),
      gate: ctx.dirtyRootGate ?? createDefaultDirtyRootGate(ctx.host),
      clock: this.clock,
      workerSessions: this.workerSessions,
    });
    // Both the cron scheduler and the event router mark loops due through the SAME
    // gated control plane (D-01): the engine still enforces the per-loop lock,
    // eligibility, and stop rule, and `queueIfBusy` defers a fire that lands
    // during a running attempt to one rerun afterwards (D-02 "due again").
    const runLoop = (loopId: string) =>
      this.requestAction({ kind: 'run_next', loopId, queueIfBusy: true });
    this.scheduler = new Scheduler({
      store: this.store,
      clock: this.clock,
      runLoop,
      log: ctx.schedulerLog,
    });
    this.cronAlarm = new CronAlarm({
      store: this.store,
      clock: this.clock,
      timer: ctx.alarmTimer ?? createSystemTimer(),
      tick: () => this.scheduler.tick(),
      log: ctx.schedulerLog,
    });
    this.eventRouter = new EventRouter({
      host: ctx.host,
      workspaceId: ctx.workspaceId,
      store: this.store,
      clock: this.clock,
      runLoop,
      workerSessions: this.workerSessions,
      log: ctx.schedulerLog,
    });
  }

  /**
   * Catch-up-on-open (Phase 2.5, D-04): run any cron loop that came due while
   * the workspace was closed, collapsing missed fires to one run per loop, and
   * log event triggers that could not be observed while closed. Awaiting this
   * waits only for the reconcile + dispatch — never for the runs themselves
   * (see {@link CatchUpReport.settled}).
   */
  async catchUpOnOpen(): Promise<CatchUpReport> {
    return this.scheduler.catchUpOnOpen();
  }

  /**
   * Arm the live schedule (Phase 5): the smart cron alarm (one timer for the next
   * due moment) and the event-trigger subscriptions. Idempotent — the runtime
   * calls it after catch-up and on every state change, so adding or editing a
   * trigger re-targets immediately (push, not poll).
   */
  async armSchedule(): Promise<void> {
    await Promise.all([this.cronAlarm.rearm(), this.eventRouter.sync()]);
  }

  /** Tear down the live schedule when the workspace closes. */
  disposeSchedule(): void {
    this.cronAlarm.dispose();
    this.eventRouter.dispose();
  }

  async requestAction(
    action: OrchestratorAction,
    source?: ActionSource,
  ): Promise<OrchestratorActionResult> {
    // Recursion guard (D-16): a worker session may not create or control loops.
    // Read-only actions (list/show/diagnose) are harmless and stay allowed.
    if (isControlAction(action) && this.workerSessions.isWorkerSession(source?.sessionId)) {
      return {
        ok: false,
        error: 'Orchestrator workers cannot create or control loops.',
      };
    }
    switch (action.kind) {
      case 'create':
        return this.create(action.input);
      case 'list':
        return this.list();
      case 'show':
        return this.show(action.loopId);
      case 'pause':
        return this.setStatus(action.loopId, 'paused');
      case 'resume':
        return this.resume(action.loopId);
      case 'stop':
        return this.setStatus(action.loopId, 'stopped');
      case 'run_next':
        return this.engine.runNext(action.loopId, {
          overrideNoProgress: action.overrideNoProgress,
          queueIfBusy: action.queueIfBusy,
        });
      case 'diagnose_session':
        return diagnoseSession({ host: this.ctx.host, workspaceId: this.ctx.workspaceId });
    }
  }

  /**
   * Whether a session id belongs to an in-flight orchestrator worker (D-16).
   * The CLI surface consults this to refuse the whole `orchestrator.*` surface
   * to workers; `requestAction` still independently rejects worker-sourced
   * control actions, so this is belt-and-suspenders, not the load-bearing guard.
   */
  isWorkerSession(sessionId: string | null | undefined): boolean {
    return this.workerSessions.isWorkerSession(sessionId);
  }

  // ── Control-plane actions ────────────────────────────────────────────────────

  private async create(input: CreateLoopInput): Promise<OrchestratorActionResult> {
    if (!input.title?.trim() || !input.goal?.trim()) {
      return { ok: false, error: 'A goal needs both a title and a goal description.' };
    }
    const loop = this.buildLoop(input);
    await this.store.mutate((state) => {
      state.loops.push(loop);
      return loop;
    });
    return { ok: true, loop, message: `Created goal "${loop.title}".` };
  }

  private async list(): Promise<OrchestratorActionResult> {
    const state = await this.store.read();
    return { ok: true, loops: state.loops, message: `${state.loops.length} goal(s).` };
  }

  private async show(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.store.getLoop(loopId);
    if (!loop) return { ok: false, error: `No goal with id ${loopId}.` };
    return { ok: true, loop };
  }

  private async resume(loopId: string): Promise<OrchestratorActionResult> {
    return this.transition(loopId, (loop) => {
      if (loop.status === 'active') return { loop, message: `"${loop.title}" is already running.` };
      if (loop.status !== 'paused' && loop.status !== 'blocked') {
        return { error: `Cannot resume a ${loop.status} goal.` };
      }
      loop.status = 'active';
      loop.statusReason = undefined;
      loop.blockedReason = undefined;
      return { loop, message: `Resumed "${loop.title}".` };
    });
  }

  private async setStatus(
    loopId: string,
    status: 'paused' | 'stopped',
  ): Promise<OrchestratorActionResult> {
    // Abort any in-flight attempt first so a stop/pause takes effect immediately;
    // the cancelled attempt is recorded by the engine (D-11).
    this.engine.cancel(loopId);
    return this.transition(loopId, (loop) => {
      if (loop.status === status) return { loop, message: `"${loop.title}" is already ${status}.` };
      if (TERMINAL.has(loop.status)) return { error: `Cannot ${verb(status)} a ${loop.status} goal.` };
      loop.status = status;
      loop.statusReason = undefined;
      loop.blockedReason = undefined;
      return { loop, message: `${capitalize(verb(status))}d "${loop.title}".` };
    });
  }

  /** Shared find + mutate + persist for status transitions. */
  private async transition(
    loopId: string,
    apply: (loop: LoopGoal) => { loop?: LoopGoal; message?: string; error?: string },
  ): Promise<OrchestratorActionResult> {
    let outcome: { message?: string; error?: string } = {};
    const touched = await this.store.mutate((state) => {
      const loop = state.loops.find((candidate) => candidate.id === loopId);
      if (!loop) {
        outcome = { error: `No goal with id ${loopId}.` };
        return null;
      }
      const before = loop.status;
      const result = apply(loop);
      outcome = { message: result.message, error: result.error };
      if (result.error) return null;
      if (loop.status !== before) loop.updatedAt = isoNow(this.clock);
      return loop;
    });
    if (outcome.error) return { ok: false, error: outcome.error };
    return { ok: true, loop: touched ?? undefined, message: outcome.message };
  }

  // ── Normalization ────────────────────────────────────────────────────────────

  private buildLoop(input: CreateLoopInput): LoopGoal {
    const now = isoNow(this.clock);
    const executionMode = input.executionMode ?? 'background-worker';
    // Worktree isolation is background-worker only (D-06/FR-24); a fixed
    // active-session loop can't run in a worktree, so the option is dropped.
    // A PR needs a worktree branch, so PR-on-complete implies isolation.
    const wantsWorktree = input.isolation === 'worktree' || Boolean(input.prPolicy?.openOnComplete);
    const isolation = wantsWorktree && executionMode !== 'active-session' ? 'worktree' : undefined;
    return {
      id: `loop-${randomUUID()}`,
      workspaceId: this.ctx.workspaceId,
      defaultCwd: input.defaultCwd,
      sessionId: input.sessionId,
      executionMode,
      hybridPolicy:
        executionMode === 'hybrid'
          ? input.hybridPolicy ?? 'prefer-background-worker'
          : input.hybridPolicy,
      isolation,
      prPolicy: isolation && input.prPolicy?.openOnComplete ? input.prPolicy : undefined,
      title: input.title.trim(),
      goal: input.goal.trim(),
      status: 'active',
      triggers: input.triggers ?? [],
      checks: input.checks ?? [],
      stopRule: { ...DEFAULT_STOP_RULE, ...input.stopRule },
      budget: input.budget,
      logPolicy: { ...DEFAULT_LOG_POLICY, ...input.logPolicy },
      tasks: input.tasks ?? [],
      attempts: [],
      createdAt: now,
      updatedAt: now,
    };
  }
}

/** Actions that create, modify, or run a loop — barred from worker sessions (D-16). */
const CONTROL_ACTIONS: ReadonlySet<OrchestratorAction['kind']> = new Set([
  'create',
  'pause',
  'resume',
  'stop',
  'run_next',
]);

function isControlAction(action: OrchestratorAction): boolean {
  return CONTROL_ACTIONS.has(action.kind);
}

function verb(status: 'paused' | 'stopped'): string {
  return status === 'paused' ? 'pause' : 'stop';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
