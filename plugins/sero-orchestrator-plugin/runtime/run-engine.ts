/**
 * Run engine — the coordinator's single advance loop (03-execution-and-scheduling.md,
 * "Coordinator Run Flow"). It holds the per-loop lock, computes ready steps,
 * starts them (in parallel up to maxConcurrentSteps), records attempts and
 * observations, applies outcomes and recovery, and signals completion.
 *
 * Step execution, recovery decisions, and outcome evaluation are injected
 * (engine-types.ts) so this orchestration is testable with fakes.
 */

import type { Loop, LoopRun, LoopStepDefinition, StepAttempt, StepOutcome } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { EngineDeps } from './engine-types';
import { computeReadySteps, hasRunningSteps, validateRuntime } from './readiness';
import { applyStepOutcome, recordCompletion } from './outcomes';
import { applyRecovery } from './recovery-apply';
import { pruneRuns } from './artifacts';

export interface RunResult {
  acquired: boolean;
  run?: LoopRun;
  reason?: string;
}

const TERMINAL_OUTCOMES = new Set<StepOutcome['status']>(['failed', 'blocked', 'needs-revision']);

export class RunEngine {
  constructor(private readonly host: OrchestratorHost, private readonly deps: EngineDeps) {}

  /** Runs the loop, then drains any `dueAgain` follow-up triggered during the run. */
  async run(loopId: string): Promise<RunResult> {
    const first = await this.runOnce(loopId);
    if (!first.acquired) return first; // lock held: the holder drains dueAgain.
    while (await this.consumeDueAgain(loopId)) {
      const more = await this.runOnce(loopId);
      if (!more.acquired) break;
    }
    return first;
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

  private async runOnce(loopId: string): Promise<RunResult> {
    const loop = await this.find(loopId);
    if (!loop) return { acquired: false, reason: 'loop not found' };
    if (loop.status !== 'active') return { acquired: false, reason: `loop is ${loop.status}` };

    if (!this.deps.locks.tryAcquire(loopId)) {
      await this.markDueAgain(loopId);
      return { acquired: false, reason: 'locked' };
    }
    try {
      const run = await this.execute(loop);
      return { acquired: true, run };
    } finally {
      this.deps.locks.release(loopId);
    }
  }

  private async execute(initial: Loop): Promise<LoopRun> {
    const now = this.host.now();
    let run: LoopRun = {
      id: this.host.newId('run'),
      runNumber: initial.runs.length + 1,
      status: 'running',
      startedStepIds: [],
      stepAttempts: [],
      recoveryDecisions: [],
      observations: [],
      startedAt: now,
    };
    let loop: Loop = {
      ...initial,
      runs: [...initial.runs, run],
      runtime: { ...initial.runtime, activeRunId: run.id, lastRunAt: now },
    };
    await this.persist(loop);

    if (this.deps.workspaceResolver) {
      const resolved = await this.deps.workspaceResolver.resolve(this.host, loop);
      loop = resolved.loop;
      if (resolved.deferred) {
        run = { ...run, status: 'waiting' };
        return await this.finalize(loop, run, resolved.deferred);
      }
    }

    let stop = false;
    while (!stop) {
      const validation = validateRuntime(loop);
      if (!validation.ok) {
        loop = this.blockRuntime(loop, validation.error ?? 'invalid runtime state');
        run = { ...run, status: 'blocked', block: loop.runtime.block };
        break;
      }
      const ready = computeReadySteps(loop);
      if (ready.length === 0) {
        run = { ...run, status: hasRunningSteps(loop) ? 'running' : 'waiting' };
        break;
      }
      const batch = ready.slice(0, loop.limits.maxConcurrentSteps ?? ready.length);
      const result = await this.runBatch(loop, run, batch);
      loop = result.loop;
      run = result.run;
      stop = result.stop;
    }
    return await this.finalize(loop, run);
  }

  private async runBatch(
    loop: Loop,
    run: LoopRun,
    batch: string[],
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
    await this.persist(loop);

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
        }),
      ),
    );

    let stop = false;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const attempt = attempts[i];
      const outcome = await this.resolveOutcome(loop, step, attempt);
      const recorded: StepAttempt = { ...attempt, outcome };
      run = { ...run, stepAttempts: [...run.stepAttempts, recorded], observations: [...run.observations, ...recorded.observations] };
      loop = applyStepOutcome(loop, step.id, recorded, outcome, this.host.now());

      if (outcome.completion) {
        const completed = recordCompletion(this.host, loop, step.id, recorded, outcome);
        loop = completed.loop;
        run = { ...run, completionSignal: completed.signal, status: completed.signal.status === 'complete' ? 'completed' : 'blocked' };
        await this.persist(loop);
        return { loop, run, stop: true };
      }

      if (TERMINAL_OUTCOMES.has(outcome.status)) {
        const decision = await this.deps.decider.decide({ host: this.host, loop, step, attempt: recorded, outcome });
        run = { ...run, recoveryDecisions: [...run.recoveryDecisions, decision] };
        const applied = applyRecovery(this.host, loop, decision);
        loop = applied.loop;
        if (applied.rejection) {
          run = { ...run, observations: [...run.observations, this.observation('system', applied.rejection)] };
        }
        if (applied.stop) {
          run = { ...run, status: decision.decision === 'block-loop' ? 'blocked' : 'waiting' };
          stop = true;
          break;
        }
      }
    }
    await this.persist(loop);
    return { loop, run, stop };
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
    const finishedRun: LoopRun = { ...run, endedAt: now };
    const runs = pruneRuns(replaceRun(loop.runs, finishedRun), loop.logPolicy.retainRuns);
    const workspace = deferredReason ? { ...loop.runtime.workspace, deferredReason } : loop.runtime.workspace;
    const cleared: Loop = {
      ...loop,
      runs,
      runtime: { ...loop.runtime, activeRunId: undefined, workspace },
      updatedAt: now,
    };
    await this.persist(cleared);
    return finishedRun;
  }

  // ── Helpers ───────────────────────────────────────────────

  private blockRuntime(loop: Loop, reason: string): Loop {
    const now = this.host.now();
    return { ...loop, status: 'blocked', runtime: { ...loop.runtime, block: { kind: 'runtime-error', reason, createdAt: now } }, updatedAt: now };
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

  private async persist(loop: Loop): Promise<void> {
    await this.host.updateState((state) => ({
      ...state,
      loops: state.loops.map((l) => (l.id === loop.id ? loop : l)),
    }));
  }
}

function replaceRun(runs: LoopRun[], run: LoopRun): LoopRun[] {
  const index = runs.findIndex((r) => r.id === run.id);
  if (index === -1) return [...runs, run];
  const next = [...runs];
  next[index] = run;
  return next;
}
