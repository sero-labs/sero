/**
 * Run engine — the coordinator's single advance loop (03-execution-and-scheduling.md,
 * "Coordinator Run Flow"). It holds the per-loop lock, computes ready steps,
 * starts them (in parallel up to maxConcurrentSteps), records attempts and
 * observations, applies outcomes and recovery, and signals completion.
 *
 * Step execution, recovery decisions, and outcome evaluation are injected
 * (engine-types.ts) so this orchestration is testable with fakes.
 */

import type { Loop, LoopRun, LoopStepDefinition } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { EngineDeps } from './engine-types';
import { computeReadySteps, hasRunningSteps, validateRuntime } from './readiness';
import { resolveBranchSkips } from './branching';
import { notifyOutcome } from './notify-outcome';
import { pruneRuns } from './artifacts';
import { appendDigest, buildRunDigest } from './digest';
import { DEFAULT_RETAIN_DIGESTS } from '../shared/defaults';
import { checkManagementLimits } from './limits';
import { toEventFiredBy, toEventObservation } from './event-match';
import { blockLimit, blockRuntime, dropStrandedEvent, mergeTriggers, needsWorkspace, replaceRun, resetRunningSteps } from './run-engine-helpers';
import { reconcileDeliveryWarning } from './delivery/availability';
import { runStepBatch } from './run-batch';
import { orphanRunningActivations } from './activations';

export interface RunResult {
  acquired: boolean;
  run?: LoopRun;
  reason?: string;
}

export class RunEngine {
  /**
   * The pendingEvent id each in-flight run consumed at start, so `commit` can
   * tell the consumed stash (cleared) from a NEWER event the coordinator
   * stashed mid-run (preserved).
   */
  private readonly consumedEvents = new Map<string, string>();

  constructor(private readonly host: OrchestratorHost, private readonly deps: EngineDeps) {}

  /** Runs the loop, then drains any `dueAgain` follow-up triggered during the run. */
  async run(loopId: string, signal?: AbortSignal): Promise<RunResult> {
    const first = await this.runOnce(loopId, signal);
    if (!first.acquired) return first; // lock held: the holder drains dueAgain.
    while (!signal?.aborted && (await this.consumeDueAgain(loopId))) {
      const more = await this.runOnce(loopId, signal);
      if (!more.acquired) break;
    }
    return first;
  }

  /**
   * Flags a loop to run again once the in-flight run drains. Used by the
   * coordinator's single-flight `runNext`: a concurrent run request must not
   * start a second engine run (which would clobber the in-flight run's abort
   * handle), so it is folded into the existing run via `dueAgain` instead.
   */
  async requestRerun(loopId: string): Promise<void> {
    await this.markDueAgain(loopId);
  }

  private async consumeDueAgain(loopId: string): Promise<boolean> {
    let consumed = false;
    await this.host.updateState((state) => ({
      ...state,
      loops: state.loops.map((loop) => {
        if (loop.id !== loopId || loop.status !== 'active' || !loop.runtime.dueAgain) return loop;
        consumed = true;
        return { ...loop, runtime: { ...loop.runtime, dueAgain: false } };
      }),
    }));
    return consumed;
  }

  private async runOnce(loopId: string, signal?: AbortSignal): Promise<RunResult> {
    const loop = await this.find(loopId);
    if (!loop) return { acquired: false, reason: 'loop not found' };
    if (loop.status !== 'active') return { acquired: false, reason: `loop is ${loop.status}` };

    if (!this.deps.locks.tryAcquire(loopId)) {
      await this.markDueAgain(loopId);
      return { acquired: false, reason: 'locked' };
    }
    try {
      const run = await this.execute(loop, signal);
      return { acquired: true, run };
    } finally {
      this.deps.locks.release(loopId);
    }
  }

  private async execute(initial: Loop, signal?: AbortSignal): Promise<LoopRun> {
    const now = this.host.now();
    // Monotonic, never reused — `runs.length` repeats once run-history pruning
    // caps it, which would reuse worktree keys/branch names across iterations.
    const runSeq = (initial.runtime.runSeq ?? initial.runs.length) + 1;
    // Consume the HEAD of the pending-event queue (Living Loops): it becomes
    // the run's `firedBy` plus an `event` observation the steps read. Events
    // queued while this run is in flight have different ids and survive
    // `commit`'s disk-authoritative merge for the iterations that follow.
    const event = initial.runtime.pendingEvents?.[0];
    if (event) this.consumedEvents.set(initial.id, event.id);
    const remainingEvents = initial.runtime.pendingEvents?.slice(1);
    let run: LoopRun = {
      id: this.host.newId('run'),
      runNumber: runSeq,
      status: 'running',
      triggerId: initial.runtime.pendingTriggerId,
      firedBy: event ? toEventFiredBy(event) : undefined,
      startedStepIds: [],
      stepAttempts: [],
      stepActivations: [],
      recoveryDecisions: [],
      observations: event ? [toEventObservation(event, this.host.newId('obs'), now)] : [],
      startedAt: now,
    };
    let loop: Loop = {
      ...initial,
      runs: [...initial.runs, run],
      // Drop last run's model/agent-unavailable warnings; this run re-discovers them.
      warnings: initial.warnings.filter((w) => w.code !== 'model-unavailable' && w.code !== 'agent-unavailable'),
      runtime: {
        ...initial.runtime,
        activeRunId: run.id,
        lastRunAt: now,
        runSeq,
        pendingTriggerId: undefined,
        pendingEvents: remainingEvents?.length ? remainingEvents : undefined,
      },
    };
    loop = await this.commit(loop);
    loop = await this.reconcilePullRequests(loop);
    // Re-evaluate delivery-tool availability each run start (FR-D5).
    loop = await this.commit(await reconcileDeliveryWarning(this.host, loop));

    let stop = false;
    while (!stop) {
      // A `disable` may have aborted this run and turned the loop off mid-flight.
      if (signal?.aborted || loop.status === 'disabled') {
        run = { ...run, status: 'cancelled' };
        break;
      }
      // Parked on a human question: do not start any step until it is answered.
      if (loop.runtime.pendingInput) {
        run = { ...run, status: 'waiting' };
        break;
      }
      const validation = validateRuntime(loop);
      if (!validation.ok) {
        loop = blockRuntime(loop, validation.error ?? 'invalid runtime state', this.host.now());
        run = { ...run, status: 'blocked', block: loop.runtime.block };
        break;
      }
      const limit = checkManagementLimits(loop, run, Date.parse(this.host.now()));
      if (!limit.ok) {
        loop = blockLimit(loop, limit.limit, limit.reason ?? 'management limit reached', this.host.now());
        run = { ...run, status: 'blocked', block: loop.runtime.block };
        break;
      }

      // Resolve branch decisions before readiness: skip guarded steps whose route
      // didn't match. The unguarded finalization step still runs and judges the
      // outcome, so a no-match (every branch skipped) surfaces as its completion.
      const branched = resolveBranchSkips(loop, this.host.now());
      if (branched !== loop) loop = await this.commit(branched);

      const ready = computeReadySteps(loop);
      if (ready.length === 0) {
        run = { ...run, status: hasRunningSteps(loop) ? 'running' : 'waiting' };
        break;
      }
      // A fan-out step runs alone in its batch: its concurrency budget goes to
      // its own activations (fan-out-run.ts). Other ready steps run next tick.
      const fanOutReady = ready.find((id) => this.step(loop, id).fanOut);
      const batch = fanOutReady ? [fanOutReady] : ready.slice(0, loop.limits.maxConcurrentSteps ?? ready.length);

      // Resolve the loop workspace lazily, only when a background-agent
      // filesystem step is about to start (D-06). `run` rides along for
      // event-pr branch resolution (spec 15).
      if (needsWorkspace(loop, batch) && this.deps.workspaceResolver) {
        const resolution = await this.deps.workspaceResolver.resolve(this.host, loop, run);
        if (resolution.blocked) {
          loop = await this.commit(blockRuntime(resolution.loop, resolution.blocked, this.host.now()));
          run = { ...run, status: 'blocked', block: loop.runtime.block };
          break;
        }
        loop = await this.commit(resolution.loop);
        if (resolution.deferred) {
          run = {
            ...run,
            status: resolution.deferred.status,
            statusReason: resolution.deferred.reason,
            retryAt: resolution.deferred.retryAt,
          };
          break;
        }
      }

      const result = await runStepBatch({
        host: this.host,
        deps: this.deps,
        loop,
        run,
        batch,
        signal,
        commit: (next) => this.commit(next),
      });
      loop = result.loop;
      run = result.run;
      stop = result.stop;
    }
    return await this.finalize(loop, run);
  }

  /**
   * Refreshes the loop's open-PR inventory at run start: lists open PRs and keeps
   * those whose branch name contains the loop id (worktree branches embed it).
   * Stateless — merged/closed PRs simply drop out because they're no longer open,
   * and PRs merged externally between runs disappear too. Steps read this to avoid
   * redoing work an open PR already covers (the model judges coverage).
   */
  private async reconcilePullRequests(loop: Loop): Promise<Loop> {
    const open = await this.host.listPullRequests().catch(() => []);
    const mine = open.filter((pr) => pr.headRefName.includes(loop.id));
    return this.commit({ ...loop, runtime: { ...loop.runtime, pullRequests: mine } });
  }

  private async finalize(loop: Loop, run: LoopRun): Promise<LoopRun> {
    const now = this.host.now();
    this.consumedEvents.delete(loop.id);
    // Any activation still 'running' at finalize is a ghost: the run has ended,
    // so no step is executing. This happens when a batch returned early (a step
    // completed or blocked the loop) leaving unprocessed siblings. Settle them so
    // the digest and run summary don't show a finished run with 'running' steps.
    const settledRun = orphanRunningActivations(run, now, run.status === 'cancelled' ? 'cancelled' : 'orphaned');
    const finishedRun: LoopRun = { ...settledRun, endedAt: now };
    // Durable digest for reflection — colocated with the loop, outside run
    // pruning. Best-effort: a digest write must never fail the run.
    await appendDigest(this.host, loop.id, buildRunDigest(loop, finishedRun), loop.logPolicy.retainDigests ?? DEFAULT_RETAIN_DIGESTS)
      .catch((error) => this.host.log(`digest write failed for ${loop.id}: ${error}`));
    const runs = pruneRuns(replaceRun(loop.runs, finishedRun), loop.logPolicy.retainRuns);
    // A cancelled run (e.g. a `disable` mid-batch) committed its batch's steps as
    // `running` before aborting. Reset those to `pending` so the loop is runnable
    // again when re-enabled — otherwise readiness never restarts them (it only
    // starts pending/ready) and `hasRunningSteps` reads them as still active,
    // wedging the loop until a restart-time reconcile. Live disable doesn't run
    // the reconciler, so this is the only place that clears them.
    const stepStates =
      run.status === 'cancelled' ? resetRunningSteps(loop.runtime.stepStates, now) : loop.runtime.stepStates;
    const cleared: Loop = {
      ...loop,
      runs,
      runtime: { ...loop.runtime, activeRunId: undefined, stepStates },
      updatedAt: now,
    };
    await this.commit(cleared);
    // Nudge the user once if this run left the loop complete or blocked (a
    // pending question already notified separately). Finalize runs once per run,
    // and a terminal loop cannot run again, so this fires once per transition.
    notifyOutcome(this.host, cleared);
    return finishedRun;
  }

  // ── Helpers ───────────────────────────────────────────────

  private step(loop: Loop, id: string): LoopStepDefinition {
    const step = loop.plan.steps.find((s) => s.id === id);
    if (!step) throw new Error(`step not found: ${id}`);
    return step;
  }

  private async markDueAgain(loopId: string): Promise<void> {
    await this.host.updateState((state) => ({
      ...state,
      loops: state.loops.map((loop) => (loop.id === loopId ? { ...loop, runtime: { ...loop.runtime, dueAgain: true } } : loop)),
    }));
  }

  private async find(loopId: string): Promise<Loop | undefined> {
    const state = await this.host.readState();
    return state?.loops.find((l) => l.id === loopId);
  }

  /**
   * Persists the loop, but never lets the engine's in-memory copy clobber what
   * the coordinator wrote concurrently:
   *
   * - a `disable` that landed mid-run is kept (the off state wins, and the
   *   returned loop carries it so `execute` stops promptly);
   * - trigger fire bookkeeping (counters, self-disables) is coordinator-
   *   authored — an event fire recorded mid-run must survive this run's
   *   snapshots. The on-disk trigger is the base; the engine's only legitimate
   *   trigger write (the terminal-completion disable) is merged on top;
   * - `dueAgain` (a folded rerun request) is only ever SET concurrently, so a
   *   set flag on disk wins over the engine's stale false;
   * - `pendingEvents` is coordinator-enqueued; the on-disk queue is
   *   authoritative (it may have grown mid-run) and the engine only removes
   *   the head it consumed at run start. A queue stranded by the loop leaving
   *   'active' is dropped visibly (dropStrandedEvent).
   */
  private async commit(loop: Loop): Promise<Loop> {
    let result = loop;
    await this.host.updateState((state) => {
      const current = state.loops.find((l) => l.id === loop.id);
      result = loop;
      if (current) {
        const consumedId = this.consumedEvents.get(loop.id);
        const queued = (current.runtime.pendingEvents ?? []).filter((e) => e.id !== consumedId);
        result = {
          ...result,
          triggers: mergeTriggers(current.triggers, result.triggers),
          runtime: {
            ...result.runtime,
            dueAgain: current.runtime.dueAgain || result.runtime.dueAgain,
            pendingEvents: queued.length ? queued : undefined,
          },
        };
      }
      if (current?.status === 'disabled' && loop.status === 'active') {
        result = { ...result, status: 'disabled', runtime: { ...result.runtime, activeRunId: undefined } };
      }
      result = dropStrandedEvent(this.host, result);
      return { ...state, loops: state.loops.map((l) => (l.id === loop.id ? result : l)) };
    });
    return result;
  }
}
