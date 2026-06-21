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
import { createPlannerRunner, type PlannerRunner } from './planner';
import { derivePlan } from './plan-deriver';
import { runHealthCheck } from './health';
import { createReflector, type Reflector } from './reflection';
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
  /**
   * Verification planner seam (spec 05, D-19). `undefined` → build the real
   * read-only planner worker (production: every loop derives a plan). `null` →
   * planning disabled; loops are created `active` with no plan (legacy path,
   * the default in tests that don't exercise planning). A function injects a
   * deterministic fake (planning tests).
   */
  planner?: PlannerRunner | null;
  /**
   * Advisory reflector seam (the redefined P-E). `undefined` → build the real
   * read-only critic; `null` → disabled (the test default); a function injects a
   * deterministic fake. Advisory only — never changes plans or control state.
   */
  reflector?: Reflector | null;
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
  /** Verification planner (spec 05); null disables planning (legacy active path). */
  private readonly planner: PlannerRunner | null;
  /** Advisory health critic (the redefined P-E); null disables reflection. */
  private readonly reflector: Reflector | null;

  constructor(private readonly ctx: CoordinatorContext) {
    this.clock = ctx.clock ?? systemClock;
    this.store = new StateStore(ctx.host, ctx.stateFilePath);
    // undefined → real planner; null → disabled; a fn → injected (tests).
    this.planner =
      ctx.planner === undefined
        ? createPlannerRunner({
            host: ctx.host,
            workspaceId: ctx.workspaceId,
            cwd: ctx.workspacePath,
            stateFilePath: ctx.stateFilePath,
          })
        : ctx.planner;
    this.reflector =
      ctx.reflector === undefined
        ? createReflector({ host: ctx.host, workspaceId: ctx.workspaceId, cwd: ctx.workspacePath })
        : ctx.reflector;
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
      reflector: this.reflector ?? undefined,
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
      case 'edit':
        return this.edit(action.loopId, { title: action.title, goal: action.goal });
      case 'replan':
        return this.replan(action.loopId);
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
      case 'health':
        return this.healthCheck();
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

  /**
   * Edit a goal's title/text. A goal-text change re-derives the verification plan
   * (spec 05): the loop drops to `draft` (unless paused — a paused loop won't run)
   * so no attempt runs against the stale plan, and the planner re-derives in the
   * background, flipping it back to `active`. Finished loops are not editable.
   */
  private async edit(
    loopId: string,
    input: { title?: string; goal?: string },
  ): Promise<OrchestratorActionResult> {
    const loop = await this.store.getLoop(loopId);
    if (!loop) return { ok: false, error: `No goal with id ${loopId}.` };
    if (TERMINAL.has(loop.status)) {
      return { ok: false, error: `Cannot edit a ${loop.status} goal.` };
    }
    const title = input.title?.trim();
    const goal = input.goal?.trim();
    if (input.title !== undefined && !title) return { ok: false, error: 'A goal needs a title.' };
    if (input.goal !== undefined && !goal) return { ok: false, error: 'A goal needs a description.' };
    if (title === undefined && goal === undefined) {
      return { ok: false, error: 'Provide a new title or goal to edit.' };
    }
    const goalChanged = goal !== undefined && goal !== loop.goal;
    const rederive = goalChanged && Boolean(this.planner);
    const updated = await this.store.updateLoop(loopId, (current) => {
      if (title) current.title = title;
      if (goal) current.goal = goal;
      if (rederive && current.status !== 'paused') {
        current.status = 'draft';
        current.statusReason = undefined;
        current.blockedReason = undefined;
      }
      current.updatedAt = isoNow(this.clock);
    });
    if (rederive) {
      void this.ensurePlan(loopId).catch((err) => {
        console.error('[orchestrator] re-derive after edit failed', err);
      });
      return { ok: true, loop: updated ?? undefined, message: `Updated "${updated?.title}" — re-deriving its verification plan.` };
    }
    return { ok: true, loop: updated ?? undefined, message: `Updated "${updated?.title}".` };
  }

  /**
   * Force a fresh verification plan on the same goal (e.g. the repo gained a test
   * runner). Drops to `draft` (unless paused) and re-derives; finished loops are
   * not re-planned.
   */
  private async replan(loopId: string): Promise<OrchestratorActionResult> {
    if (!this.planner) return { ok: false, error: 'Verification planning is not available.' };
    const loop = await this.store.getLoop(loopId);
    if (!loop) return { ok: false, error: `No goal with id ${loopId}.` };
    if (TERMINAL.has(loop.status)) {
      return { ok: false, error: `Cannot re-derive a ${loop.status} goal.` };
    }
    if (loop.status !== 'paused') {
      await this.store.updateLoop(loopId, (current) => {
        current.status = 'draft';
        current.statusReason = undefined;
        current.blockedReason = undefined;
        current.updatedAt = isoNow(this.clock);
      });
    }
    void this.ensurePlan(loopId, true).catch((err) => {
      console.error('[orchestrator] replan failed', err);
    });
    return { ok: true, loop: (await this.store.getLoop(loopId)) ?? undefined, message: `Re-deriving the verification plan for "${loop.title}".` };
  }

  private async create(input: CreateLoopInput): Promise<OrchestratorActionResult> {
    if (!input.title?.trim() || !input.goal?.trim()) {
      return { ok: false, error: 'A goal needs both a title and a goal description.' };
    }
    const loop = this.buildLoop(input);
    await this.store.mutate((state) => {
      state.loops.push(loop);
      return loop;
    });
    if (this.planner && loop.status === 'draft') {
      // Derive the verification plan in the background (spec 05, push-model):
      // create returns the draft immediately; the planner flips it to `active`
      // when the plan lands, so the tool/CLI response is never blocked on an LLM
      // call. State writes stay inside the coordinator (single executor).
      void this.ensurePlan(loop.id).catch((err) => {
        console.error('[orchestrator] verification planning failed', err);
      });
      return { ok: true, loop, message: `Created goal "${loop.title}" — deriving its verification plan.` };
    }
    return { ok: true, loop, message: `Created goal "${loop.title}".` };
  }

  /**
   * Derive (or re-derive) a loop's verification plan (spec 05, D-19) — delegates to
   * `derivePlan` (single-writer). Runs at create, on goal edit, and on a forced
   * re-plan. Public so the edit/replan surfaces and tests can re-derive.
   */
  async ensurePlan(loopId: string, force = false): Promise<void> {
    return derivePlan(
      { planner: this.planner, store: this.store, clock: this.clock, host: this.ctx.host },
      loopId,
      force,
    );
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

  /**
   * Advisory cross-loop health check (the redefined P-E) — delegates to
   * {@link runHealthCheck}. On-demand only; stores each loop's reflection but never
   * changes plans or control state. Workers cannot trigger it (D-16).
   */
  private healthCheck(): Promise<OrchestratorActionResult> {
    return runHealthCheck({ store: this.store, clock: this.clock, reflector: this.reflector });
  }

  private async resume(loopId: string): Promise<OrchestratorActionResult> {
    const current = await this.store.getLoop(loopId);
    // Resuming an approval-required block IS the approval: the work already meets
    // its criteria, so this completes the loop (spec 05 §7) rather than rerunning.
    if (current?.status === 'blocked' && current.blockedReason === 'approval-required') {
      return this.engine.approve(loopId);
    }
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
      // With a planner the loop starts `draft` and the planner flips it to
      // `active` once the verification plan lands (spec 05); with planning
      // disabled it starts `active` (legacy).
      status: this.planner ? 'draft' : 'active',
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
  'edit',
  'replan',
  'pause',
  'resume',
  'stop',
  'run_next',
  // health triggers reflector subagents; keep workers from driving that cost.
  'health',
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
