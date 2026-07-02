/**
 * Run engine — the coordinator's single advance loop (03-execution-and-scheduling.md,
 * "Coordinator Run Flow"). It holds the per-loop lock, computes ready steps,
 * starts them (in parallel up to maxConcurrentSteps), records attempts and
 * observations, applies outcomes and recovery, and signals completion.
 *
 * Step execution, recovery decisions, and outcome evaluation are injected
 * (engine-types.ts) so this orchestration is testable with fakes.
 */

import type { HumanQuestion, Loop, LoopBlock, LoopRun, LoopStepDefinition, StepAttempt, StepOutcome } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { EngineDeps } from './engine-types';
import { computeReadySteps, hasRunningSteps, validateRuntime } from './readiness';
import { resolveBranchSkips } from './branching';
import { enforceRouteContract } from './route-contract';
import { acceptsCompletion, applyStepOutcome, recordCompletion } from './outcomes';
import { parkForInput } from './human-input';
import { notifyOutcome } from './notify-outcome';
import { applyRecovery } from './recovery-apply';
import { pruneRuns } from './artifacts';
import { appendDigest, buildRunDigest } from './digest';
import { DEFAULT_RETAIN_DIGESTS } from '../shared/defaults';
import { checkManagementLimits } from './limits';
import { recordAgentWarning, recordModelWarning } from './run-warnings';
import { isRecurring } from './scheduler';
import { toEventFiredBy, toEventObservation } from './event-match';
import { dropStrandedEvent, mergeTriggers, replaceRun, resetRunningSteps } from './run-engine-helpers';

export interface RunResult {
  acquired: boolean;
  run?: LoopRun;
  reason?: string;
}

const TERMINAL_OUTCOMES = new Set<StepOutcome['status']>(['failed', 'blocked', 'needs-revision']);

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
    // Consume the event this iteration was fired by (Living Loops): it becomes
    // the run's `firedBy` plus an `event` observation the steps read, and the
    // stash is cleared. A NEW event stashed while this run is in flight is a
    // different id and survives `commit`'s preservation for the next iteration.
    const event = initial.runtime.pendingEvent;
    if (event) this.consumedEvents.set(initial.id, event.id);
    let run: LoopRun = {
      id: this.host.newId('run'),
      runNumber: runSeq,
      status: 'running',
      firedBy: event ? toEventFiredBy(event) : undefined,
      startedStepIds: [],
      stepAttempts: [],
      recoveryDecisions: [],
      observations: event ? [toEventObservation(event, this.host.newId('obs'), now)] : [],
      startedAt: now,
    };
    let loop: Loop = {
      ...initial,
      runs: [...initial.runs, run],
      // Drop last run's model/agent-unavailable warnings; this run re-discovers them.
      warnings: initial.warnings.filter((w) => w.code !== 'model-unavailable' && w.code !== 'agent-unavailable'),
      runtime: { ...initial.runtime, activeRunId: run.id, lastRunAt: now, runSeq, pendingEvent: undefined },
    };
    loop = await this.commit(loop);
    loop = await this.reconcilePullRequests(loop);

    let stop = false;
    let deferred: string | undefined;
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
        loop = this.blockRuntime(loop, validation.error ?? 'invalid runtime state');
        run = { ...run, status: 'blocked', block: loop.runtime.block };
        break;
      }
      const limit = checkManagementLimits(loop, run, Date.parse(this.host.now()));
      if (!limit.ok) {
        loop = this.blockLimit(loop, limit.limit, limit.reason ?? 'management limit reached');
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
      const batch = ready.slice(0, loop.limits.maxConcurrentSteps ?? ready.length);

      // Resolve the loop workspace lazily, only when a background-agent
      // filesystem step is about to start (D-06).
      if (this.needsWorkspace(loop, batch) && this.deps.workspaceResolver) {
        const resolution = await this.deps.workspaceResolver.resolve(this.host, loop);
        loop = await this.commit(resolution.loop);
        if (resolution.deferred) {
          run = { ...run, status: 'waiting' };
          deferred = resolution.deferred;
          break;
        }
      }

      const result = await this.runBatch(loop, run, batch, signal);
      loop = result.loop;
      run = result.run;
      stop = result.stop;
    }
    return await this.finalize(loop, run, deferred);
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

  private needsWorkspace(loop: Loop, batch: string[]): boolean {
    if (loop.runtime.workspace.resolved) return false;
    return batch.some((id) => this.step(loop, id).execution.type === 'background-agent');
  }

  private async runBatch(
    loop: Loop,
    run: LoopRun,
    batch: string[],
    signal?: AbortSignal,
  ): Promise<{ loop: Loop; run: LoopRun; stop: boolean }> {
    const startNow = this.host.now();
    // Mark the batch running and persist so the UI shows live progress.
    for (const stepId of batch) {
      const prev = loop.runtime.stepStates[stepId];
      loop = {
        ...loop,
        runtime: {
          ...loop.runtime,
          stepStates: { ...loop.runtime.stepStates, [stepId]: { ...prev, status: 'running', attempts: prev.attempts + 1, updatedAt: startNow } },
        },
      };
    }
    run = { ...run, startedStepIds: [...run.startedStepIds, ...batch] };
    loop = await this.commit(loop);

    const steps = batch.map((id) => this.step(loop, id));
    const attempts = await Promise.all(
      steps.map((step) =>
        this.deps.executor.run({
          host: this.host,
          loop,
          run,
          step,
          attemptNumber: loop.runtime.stepStates[step.id].attempts,
          parentSessionId: loop.runtime.parentSessionId,
          workspace: loop.runtime.workspace.resolved,
          signal,
        }),
      ),
    );

    // If a `disable` aborted mid-batch, stop here: do not apply the aborted
    // attempts' outcomes or run recovery (which would mask the disable).
    if (signal?.aborted) {
      return { loop, run: { ...run, status: 'cancelled' }, stop: true };
    }

    let stop = false;
    // A step in this batch that asked the user; the loop parks on it after the
    // batch's other (non-asking) outcomes are applied.
    let parked: { stepId: string; questions: HumanQuestion[] } | undefined;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const attempt = attempts[i];
      // A "succeeded" step that didn't record a routing variable a later step
      // branches on becomes needs-revision, so recovery handles it instead of the
      // branch silently skipping and the loop completing having done nothing.
      const outcome = enforceRouteContract(loop, step, await this.resolveOutcome(loop, step, attempt));
      const recorded: StepAttempt = { ...attempt, outcome };
      run = { ...run, stepAttempts: [...run.stepAttempts, recorded], observations: [...run.observations, ...recorded.observations] };
      if (recorded.modelFallback) {
        loop = recordModelWarning(this.host, loop, step.id, recorded.modelFallback.requestedModel);
      }
      if (recorded.agentFallback) {
        loop = recordAgentWarning(this.host, loop, step.id, recorded.agentFallback.requestedAgent);
      }

      // The step asked the user. Reset it to pending so it re-runs with the answer,
      // and remember to park the loop; do not apply this outcome or run recovery.
      if (outcome.questions && outcome.questions.length > 0) {
        loop = this.resetStepPending(loop, step.id);
        if (!parked) parked = { stepId: step.id, questions: outcome.questions };
        continue;
      }

      const applied = this.applyOutcome(loop, run, step.id, recorded, outcome);
      loop = applied.loop;
      run = applied.run;
      if (applied.completed) {
        loop = await this.commit(loop);
        return { loop, run, stop: true };
      }

      // Recurring loops: after any non-completing step, a dedicated check can end
      // THIS RUN early — so an iteration that finds nothing to do skips its
      // remaining steps instead of running them all. This ends the iteration, NOT
      // the loop: a scheduled loop stays active and fires again next interval. The
      // checker is told that starting/claiming work means "keep going".
      if (this.deps.stopChecker && !TERMINAL_OUTCOMES.has(outcome.status) && isRecurring(loop)) {
        const decision = await this.deps.stopChecker.check({ host: this.host, loop, run });
        if (decision.stop) {
          this.host.log(`Loop ${loop.id} run ended early — nothing to do: ${decision.reason}`);
          run = { ...run, status: 'completed' };
          return { loop, run, stop: true };
        }
      }

      if (TERMINAL_OUTCOMES.has(outcome.status)) {
        const decision = await this.deps.decider.decide({ host: this.host, loop, step, attempt: recorded, outcome });
        run = { ...run, recoveryDecisions: [...run.recoveryDecisions, decision] };

        if (decision.decision === 'accept-step' && decision.acceptedOutcome) {
          // The model judged the step actually succeeded; re-apply the corrected
          // outcome exactly like a reported one so its variables and completion flow.
          const accepted = this.applyOutcome(loop, run, step.id, recorded, decision.acceptedOutcome);
          loop = accepted.loop;
          run = accepted.run;
          if (accepted.completed) {
            loop = await this.commit(loop);
            return { loop, run, stop: true };
          }
          continue;
        }

        const recovery = applyRecovery(this.host, loop, decision);
        loop = recovery.loop;
        if (recovery.rejection) {
          run = { ...run, observations: [...run.observations, this.observation('system', recovery.rejection)] };
        }
        if (recovery.stop) {
          run = { ...run, status: decision.decision === 'block-loop' ? 'blocked' : 'waiting' };
          stop = true;
          break;
        }
      }
    }
    // A step asked the user: park the loop (durable pendingInput) and stop the run.
    if (parked && !stop) {
      loop = parkForInput(this.host, loop, parked.stepId, parked.questions);
      run = { ...run, status: 'waiting' };
      loop = await this.commit(loop);
      return { loop, run, stop: true };
    }
    loop = await this.commit(loop);
    return { loop, run, stop };
  }

  /**
   * Resets a step to pending (clearing its outcome) when it asks the user. The
   * attempt count is reset too: asking is a deliberate pause, not a failed work
   * attempt, so the step keeps a full budget for its re-run after the answer.
   */
  private resetStepPending(loop: Loop, stepId: string): Loop {
    const prev = loop.runtime.stepStates[stepId];
    if (!prev) return loop;
    const now = this.host.now();
    return {
      ...loop,
      runtime: {
        ...loop.runtime,
        stepStates: { ...loop.runtime.stepStates, [stepId]: { ...prev, status: 'pending', outcome: undefined, attempts: 0, updatedAt: now } },
      },
    };
  }

  /**
   * Records a StepOutcome on loop state and, if it carries a completion signal,
   * moves the loop to complete/blocked. Shared by the normal outcome path and
   * the accept-step recovery path so completion is handled identically.
   */
  private applyOutcome(
    loop: Loop,
    run: LoopRun,
    stepId: string,
    attempt: StepAttempt,
    outcome: StepOutcome,
  ): { loop: Loop; run: LoopRun; completed: boolean } {
    loop = applyStepOutcome(loop, stepId, attempt, outcome, this.host.now());
    if (!outcome.completion || !acceptsCompletion(this.host, loop, stepId, outcome.completion)) {
      return { loop, run, completed: false };
    }
    const completed = recordCompletion(this.host, loop, stepId, attempt, outcome);
    return {
      loop: completed.loop,
      run: { ...run, completionSignal: completed.signal, status: completed.signal.status === 'complete' ? 'completed' : 'blocked' },
      completed: true,
    };
  }

  /** Uses the reported outcome, else the evaluator, else a mechanical fallback. */
  private async resolveOutcome(loop: Loop, step: LoopStepDefinition, attempt: StepAttempt): Promise<StepOutcome> {
    if (attempt.outcome) return attempt.outcome;
    if (this.deps.evaluator) return this.deps.evaluator.evaluate({ host: this.host, loop, step, attempt });
    return {
      status: attempt.status === 'completed' ? 'succeeded' : 'failed',
      summary: attempt.error ?? `step ${step.id} ${attempt.status}`,
    };
  }

  private async finalize(loop: Loop, run: LoopRun, deferredReason?: string): Promise<LoopRun> {
    const now = this.host.now();
    this.consumedEvents.delete(loop.id);
    const finishedRun: LoopRun = { ...run, endedAt: now };
    // Durable digest for reflection — colocated with the loop, outside run
    // pruning. Best-effort: a digest write must never fail the run.
    await appendDigest(this.host, loop.id, buildRunDigest(loop, finishedRun), loop.logPolicy.retainDigests ?? DEFAULT_RETAIN_DIGESTS)
      .catch((error) => this.host.log(`digest write failed for ${loop.id}: ${error}`));
    const runs = pruneRuns(replaceRun(loop.runs, finishedRun), loop.logPolicy.retainRuns);
    const workspace = deferredReason ? { ...loop.runtime.workspace, deferredReason } : loop.runtime.workspace;
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
      runtime: { ...loop.runtime, activeRunId: undefined, workspace, stepStates },
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

  private blockRuntime(loop: Loop, reason: string): Loop {
    const now = this.host.now();
    return { ...loop, status: 'blocked', runtime: { ...loop.runtime, block: { kind: 'runtime-error', reason, createdAt: now } }, updatedAt: now };
  }

  private blockLimit(loop: Loop, limit: LoopBlock['limit'], reason: string): Loop {
    const now = this.host.now();
    return { ...loop, status: 'blocked', runtime: { ...loop.runtime, block: { kind: 'management-limit', reason, createdAt: now, limit } }, updatedAt: now };
  }

  private step(loop: Loop, id: string): LoopStepDefinition {
    const step = loop.plan.steps.find((s) => s.id === id);
    if (!step) throw new Error(`step not found: ${id}`);
    return step;
  }

  private observation(source: 'system', summary: string) {
    return { id: this.host.newId('obs'), source, summary, createdAt: this.host.now() };
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
   * - `pendingEvent` is coordinator-stashed; the engine only clears the one it
   *   consumed at run start — a NEWER stash (different id) is preserved, and a
   *   stash stranded by the loop leaving 'active' is dropped visibly
   *   (dropStrandedEvent).
   */
  private async commit(loop: Loop): Promise<Loop> {
    let result = loop;
    await this.host.updateState((state) => {
      const current = state.loops.find((l) => l.id === loop.id);
      result = loop;
      if (current) {
        const consumedId = this.consumedEvents.get(loop.id);
        const stashed = current.runtime.pendingEvent;
        result = {
          ...result,
          triggers: mergeTriggers(current.triggers, result.triggers),
          runtime: {
            ...result.runtime,
            dueAgain: current.runtime.dueAgain || result.runtime.dueAgain,
            pendingEvent: stashed && stashed.id !== consumedId ? stashed : result.runtime.pendingEvent,
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

