/**
 * Coordinator — the single component that advances loop state.
 *
 * UI, tools, and slash commands send `OrchestratorAction` envelopes through
 * `requestAction`. The coordinator owns lifecycle transitions and (from
 * Phase 3) coordinator runs. Nothing else mutates loop runtime state.
 *
 * This Phase 1 implementation wires every action and persists state. Planning
 * (Phase 2) and the run engine, locks, and recovery (Phase 3+) extend it.
 */

import type {
  ContextOverrides,
  CreateLoopOptions,
  Loop,
  LoopRun,
  OrchestratorAction,
  OrchestratorActionResult,
  OrchestratorEvent,
  OrchestratorState,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/defaults';
import type { OrchestratorHost } from './host';
import { buildDraftLoop } from './loop-factory';
import { activate, disable, enable, type TransitionResult } from './lifecycle';
import { applyLoopContext, applyLoopDelivery, applyStepAgent, applyStepModel, applyStepTools, planIsActivatable } from './plan-mapping';
import { validateDeliverySettings } from './schema';
import { reconcileDeliveryWarning } from './delivery/availability';
import { runPlanningFlow } from './planning-flow';
import { RunEngine } from './run-engine';
import type { EngineDeps } from './engine-types';
import { reconcileAll } from './reconcile';
import { applyRecovery } from './recovery-apply';
import { buildRevisedLoop } from './revise';
import { handleReflectAction } from './reflect-actions';
import { handleLibraryAction, isLibraryAction } from './library-actions';
import { applyAnswerInput } from './input-actions';
import { evaluateCronTriggers, isEventArmedOnly, isRecurring, rearmLoop } from './scheduler';
import { broadcastEvent, drainPendingEvent, type CoordinatorRunSeam } from './event-delivery';
import { retryLoop, retryStepAction, runAgain } from './restart-actions';
import { buildLifecycleEvents } from './lifecycle-events';
import { computeReadySteps, hasRunningSteps } from './readiness';
import type { PlanRevision, RecoveryDecision } from '../shared/types';

export class Coordinator {
  protected readonly engine?: RunEngine;
  /** Per-loop abort handle for the in-flight run, so `disable` can kill its subagents. */
  private readonly running = new Map<string, AbortController>();

  constructor(protected readonly host: OrchestratorHost, deps?: EngineDeps) {
    if (deps) this.engine = new RunEngine(host, deps);
  }

  /** Restart recovery: reconcile orphaned runs/attempts before scheduling. */
  async reconcile(): Promise<void> {
    await reconcileAll(this.host);
  }

  /**
   * Evaluates cron/hybrid triggers for every loop and runs the ones now due.
   * Missed fires while the workspace was closed collapse into one catch-up run.
   * Called on workspace open and on a coarse interval (FR-15, FR-16).
   */
  async tick(): Promise<void> {
    const nowMs = Date.parse(this.host.now());
    const state = await this.readState();
    const dueLoopIds: string[] = [];
    for (const loop of state.loops) {
      if (loop.status !== 'active') continue;
      // Don't overlap: skip a loop whose previous iteration is still running.
      if (loop.runtime.activeRunId) continue;
      // Parked on a human question: hold off scheduled fires until it's answered.
      if (loop.runtime.pendingInput) continue;
      const { loop: updated, due } = evaluateCronTriggers(loop, nowMs);
      if (updated !== loop) await this.replaceLoop(updated);
      if (due) dueLoopIds.push(loop.id);
    }
    for (const loopId of dueLoopIds) await this.fireScheduled(loopId);
    // Restart safety: an event stashed while the loop was busy (or while the
    // app was quitting) still owes the loop a fresh iteration — consume it.
    for (const loop of state.loops) {
      if (loop.runtime.pendingEvent) await this.drainPendingEvent(loop.id);
    }
  }

  /** Runs one scheduled iteration as a fresh pass. */
  private async fireScheduled(loopId: string): Promise<void> {
    const loop = await this.findLoop(loopId);
    if (!loop || loop.status !== 'active') return;
    await this.runFreshPass(loop);
  }

  /**
   * Starts a fresh iteration: drops the previous iteration's worktree (its
   * branch/PR is kept), re-arms the plan (steps back to pending, run context
   * cleared), then runs it. Shared by scheduled fires and a manual "Run next"
   * on a loop whose previous pass already finished.
   */
  private async runFreshPass(loop: Loop): Promise<OrchestratorActionResult> {
    const prior = loop.runtime.workspace.resolved;
    if (prior?.type === 'managed-worktree') {
      await this.host.removeWorktree(prior.worktreeKey ?? loop.id, { force: true });
    }
    const rearmed = rearmLoop(loop, this.host.now());
    await this.replaceLoop(rearmed);
    return this.runNext(loop.id, rearmed);
  }

  /**
   * Broadcasts one event to every active loop (Living Loops, spec 12).
   * Semantics live in event-delivery.ts; the seam keeps the coordinator the
   * only component that starts runs.
   */
  fireEvent(event: OrchestratorEvent): Promise<void> {
    return broadcastEvent(this.host, this.runSeam(), event);
  }

  /** Consumes a stashed pending event once the loop is idle (event-delivery.ts). */
  private drainPendingEvent(loopId: string): Promise<void> {
    return drainPendingEvent(this.host, this.runSeam(), loopId);
  }

  /** The coordinator internals event delivery reaches back through. */
  private runSeam(): CoordinatorRunSeam {
    return {
      isRunning: (loopId) => this.running.has(loopId),
      findLoop: (loopId) => this.findLoop(loopId),
      replaceLoop: (loop) => this.replaceLoop(loop),
      runNext: (loopId, known) => this.runNext(loopId, known),
    };
  }

  async requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult> {
    // Loop Library actions (library_*) are routed as a group, keeping the switch
    // below focused on per-loop lifecycle.
    if (isLibraryAction(action)) return handleLibraryAction(this.host, action);
    switch (action.kind) {
      case 'create':
        return this.create(action.prompt, action.title, action.options);
      case 'list':
        return this.list();
      case 'show':
        return this.show(action.loopId);
      case 'activate':
        return this.activateLoop(action.loopId);
      case 'disable':
        return this.disableLoop(action.loopId);
      case 'enable':
        return this.transition(action.loopId, (loop) => enable(loop, this.host.now()));
      case 'run_next':
        return this.manualRunNext(action.loopId);
      case 'run_again':
        return this.runAgain(action.loopId);
      case 'retry':
        return this.retryLoop(action.loopId);
      case 'retry_step':
        return this.retryStepAction(action.loopId, action.stepId);
      case 'revise':
        return this.revise(action.loopId, action.prompt);
      case 'choose_recovery':
        return this.chooseRecovery(action.loopId, action.decision);
      case 'set_step_model':
        return this.applyOverride(action.loopId, (loop, now) => applyStepModel(loop, action.stepId, action.model, action.thinking, now));
      case 'set_step_tools':
        return this.applyOverride(action.loopId, (loop, now) => applyStepTools(loop, action.stepId, action.tools, now));
      case 'set_step_agent':
        return this.applyOverride(action.loopId, (loop, now) => applyStepAgent(loop, action.stepId, action.agent, now));
      case 'set_loop_context':
        return this.setLoopContext(action.loopId, action.overrides);
      case 'set_delivery':
        return this.applyOverride(action.loopId, (loop, now) => applyLoopDelivery(loop, action.delivery, now));
      case 'reflect':
      case 'reflect_workspace':
      case 'choose_suggestion':
        return handleReflectAction(this.host, action);
      case 'answer_input':
        return this.answerInput(action);
      case 'delete':
        return this.delete(action.loopId, action.deleteBranch);
      default: {
        const exhaustive: never = action;
        return { ok: false, error: `Unknown action: ${JSON.stringify(exhaustive)}` };
      }
    }
  }

  // ── Reads ─────────────────────────────────────────────────

  protected async readState(): Promise<OrchestratorState> {
    return (await this.host.readState()) ?? structuredClone(DEFAULT_STATE);
  }

  async list(): Promise<OrchestratorActionResult> {
    const state = await this.readState();
    return { ok: true, loops: state.loops };
  }

  async show(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    return loop ? { ok: true, loop } : { ok: false, error: `Loop not found: ${loopId}` };
  }

  protected async findLoop(loopId: string): Promise<Loop | undefined> {
    const state = await this.readState();
    return state.loops.find((l) => l.id === loopId);
  }

  // ── Create ────────────────────────────────────────────────

  async create(
    prompt: string,
    title?: string,
    options?: CreateLoopOptions,
  ): Promise<OrchestratorActionResult> {
    if (!prompt.trim()) return { ok: false, error: 'A loop prompt is required.' };
    if (options?.delivery) {
      const deliveryErrors = validateDeliverySettings(options.delivery);
      if (deliveryErrors.length > 0) return { ok: false, error: deliveryErrors.join('; ') };
    }
    // Build the draft first so we have a stable id and parentSessionId for the
    // planning model call, then run the shared planning flow (plan / clarifying
    // questions / blocked draft).
    const draft = buildDraftLoop(this.host, { prompt, title, options });
    const loop = await runPlanningFlow(this.host, draft, { prompt, options, title });
    await this.appendLoop(loop);
    // A planner clarification parks the new draft — tell followers it asked.
    this.emitEvents(buildLifecycleEvents(this.host, undefined, loop));

    // Activate-after-create only when a valid plan landed (no pending question,
    // no validation block).
    if (options?.activate && !loop.runtime.pendingInput && !loop.runtime.block) {
      return this.activateLoop(loop.id);
    }
    return { ok: true, loop };
  }

  /**
   * Records the user's answer to a loop's pending question. A step question
   * resumes the run (the asking step re-runs with the answer in its notes); a
   * planner question re-runs the planner with the answers folded in.
   */
  async answerInput(action: Extract<OrchestratorAction, { kind: 'answer_input' }>): Promise<OrchestratorActionResult> {
    const result = await applyAnswerInput(this.host, action);
    if (!result.ok || !result.loop) return { ok: result.ok, error: result.error, loop: result.loop };
    await this.replaceLoop(result.loop);
    if (result.resume && result.loop.status === 'active') {
      return this.runNext(result.loop.id, result.loop);
    }
    return { ok: true, loop: result.loop };
  }

  /** Activates a draft only after confirming its plan is structurally valid. */
  async activateLoop(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const gate = planIsActivatable(loop);
    if (!gate.ok) return { ok: false, error: gate.error };
    // Surface a missing delivery tool at activation (fail-soft — FR-D5); each
    // run start re-evaluates, so the warning clears once the tool appears.
    const checked = await reconcileDeliveryWarning(this.host, loop);
    if (checked !== loop) await this.replaceLoop(checked);
    return this.transition(loopId, (current) => activate(current, this.host.now()));
  }

  protected async appendLoop(loop: Loop): Promise<void> {
    await this.host.updateState((state) => ({ ...state, loops: [...state.loops, loop] }));
  }

  // ── Delete ────────────────────────────────────────────────

  /**
   * Permanently removes a loop and its config. If the loop resolved a managed
   * worktree, that worktree is removed (best-effort and tolerant of an
   * already-gone worktree). By default its branch is kept so any committed or
   * PR'd work survives; pass `deleteBranch` to delete the local branch too. The
   * loop is then dropped from state. Allowed from any status.
   */
  async delete(loopId: string, deleteBranch?: boolean): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const resolved = loop.runtime.workspace.resolved;
    if (resolved?.type === 'managed-worktree') {
      await this.host.removeWorktree(resolved.worktreeKey ?? loopId, { force: true, deleteBranch });
    }
    await this.host.updateState((state) => ({
      ...state,
      loops: state.loops.filter((l) => l.id !== loopId),
    }));
    this.host.log(`Deleted loop ${loopId}`);
    return { ok: true };
  }

  // ── Lifecycle transitions ─────────────────────────────────

  /**
   * Disables a loop: aborts any in-flight run first (so its background
   * subagents stop promptly), then marks the loop `disabled` and clears its
   * active run. Scheduled triggers no longer fire until the loop is `enable`d.
   */
  protected async disableLoop(loopId: string): Promise<OrchestratorActionResult> {
    this.running.get(loopId)?.abort();
    return this.mutateLoop(loopId, (loop) => disable(loop, this.host.now()));
  }

  protected async transition(
    loopId: string,
    apply: (loop: Loop) => TransitionResult,
  ): Promise<OrchestratorActionResult> {
    const result = await this.mutateLoop(loopId, apply);
    if (!result.ok) return result;
    // Activating/resuming may make the loop immediately runnable — except a
    // purely event-armed loop, which waits for its first event instead of
    // burning an eventless pass (isEventArmedOnly).
    if (result.loop && result.loop.status === 'active' && !isEventArmedOnly(result.loop)) {
      return this.runNext(result.loop.id, result.loop);
    }
    return result;
  }

  /**
   * Applies a pure mutation to one loop and persists it. The mutation returns
   * a TransitionResult; on success the new loop replaces the old one.
   */
  protected async mutateLoop(
    loopId: string,
    apply: (loop: Loop) => TransitionResult,
  ): Promise<OrchestratorActionResult> {
    let outcome: TransitionResult = { ok: false, error: `Loop not found: ${loopId}` };
    await this.host.updateState((state) => {
      const index = state.loops.findIndex((l) => l.id === loopId);
      if (index === -1) {
        outcome = { ok: false, error: `Loop not found: ${loopId}` };
        return state;
      }
      outcome = apply(state.loops[index]);
      if (!outcome.ok || !outcome.loop) return state;
      const loops = [...state.loops];
      loops[index] = outcome.loop;
      return { ...state, loops };
    });
    return outcome;
  }

  // ── Run / revise / recovery (extended in later phases) ────

  /**
   * Requests one coordinator run for a loop. Phase 1 only validates that the
   * loop is active; the run engine, locks, and step execution arrive in later
   * phases. `known` lets callers pass a freshly-transitioned loop.
   */
  /**
   * Manual "Run next". A whole pass runs in one `runNext`, so if the previous
   * pass already finished (no run in flight, nothing ready or running) on a
   * recurring loop, this starts a FRESH iteration — re-arming like a scheduled
   * fire — instead of producing an empty no-op run. A pass still in progress, or
   * a non-recurring loop, advances normally.
   */
  async manualRunNext(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    if (loop.status !== 'active') {
      return { ok: false, error: `Loop ${loopId} is "${loop.status}", not active.` };
    }
    if (loop.runtime.pendingInput) {
      return { ok: false, error: 'This loop is waiting for you to answer a question.', loop };
    }
    const passSettled =
      !loop.runtime.activeRunId && !hasRunningSteps(loop) && computeReadySteps(loop).length === 0;
    if (passSettled && isRecurring(loop)) return this.runFreshPass(loop);
    return this.runNext(loopId, loop);
  }

  /** Restart the whole plan from the first step (restart-actions.ts). */
  runAgain(loopId: string): Promise<OrchestratorActionResult> {
    return runAgain(this.host, this.runSeam(), loopId);
  }

  async runNext(loopId: string, known?: Loop): Promise<OrchestratorActionResult> {
    const loop = known ?? (await this.findLoop(loopId));
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    if (loop.status !== 'active') {
      return { ok: false, error: `Loop ${loopId} is "${loop.status}", not active.` };
    }
    // Parked on a human question: nothing runs until the user answers it.
    if (loop.runtime.pendingInput) {
      return { ok: false, error: 'This loop is waiting for you to answer a question.', loop };
    }
    if (!this.engine) return { ok: true, loop };
    // Single-flight per loop: one in-flight run owns the loop's abort handle. A
    // concurrent `run_next` must not overwrite it (which `disable` relies on) —
    // fold the request into the in-flight run via the engine's `dueAgain` drain.
    if (this.running.has(loopId)) {
      await this.engine.requestRerun(loopId);
      return { ok: true, loop };
    }
    const controller = new AbortController();
    this.running.set(loopId, controller);
    let run: LoopRun | undefined;
    try {
      run = (await this.engine.run(loopId, controller.signal)).run;
    } finally {
      // Clear the handle only if it is still ours (single-flight guarantees it).
      if (this.running.get(loopId) === controller) {
        this.running.delete(loopId);
      }
    }
    // An event that fired while this run was in flight owes the loop a fresh
    // iteration — consume the stash now that the loop is idle again.
    await this.drainPendingEvent(loopId);
    const updated = await this.findLoop(loopId);
    // Internal loop:* events for followers (fire-and-forget). Compared against
    // the loop as this call found it, so a question raised mid-run emits once.
    this.emitEvents(buildLifecycleEvents(this.host, loop, updated, run));
    return { ok: true, loop: updated, run };
  }

  /** Fire-and-forget: lifecycle emissions never delay or fail the action that caused them. */
  private emitEvents(events: OrchestratorEvent[]): void {
    for (const event of events) {
      void this.fireEvent(event).catch((error) => this.host.log(`Lifecycle event ${event.source} failed: ${error}`));
    }
  }

  /** Manual plan revision: ask the LLM for a revised plan, validate, and apply. */
  async revise(loopId: string, prompt?: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const outcome = await buildRevisedLoop(this.host, loop, prompt);
    if (outcome.error || !outcome.loop) {
      await this.recordRejectedRevision(loop, outcome.rejectionReason ?? outcome.error ?? 'Revision failed.');
      return { ok: false, error: outcome.error ?? 'Revision failed.' };
    }
    await this.replaceLoop(outcome.loop);
    return { ok: true, loop: outcome.loop };
  }

  /** Retry a stuck loop's blocked/failed steps (restart-actions.ts). */
  retryLoop(loopId: string): Promise<OrchestratorActionResult> {
    return retryLoop(this.host, this.runSeam(), loopId);
  }

  /** Retry a single blocked/failed step (restart-actions.ts). */
  retryStepAction(loopId: string, stepId: string): Promise<OrchestratorActionResult> {
    return retryStepAction(this.host, this.runSeam(), loopId, stepId);
  }

  /** Finds a loop, applies a pure { ok, loop } mapping, and persists it. Shared by the override handlers (next run). */
  private async applyOverride(
    loopId: string,
    apply: (loop: Loop, now: string) => { ok: boolean; loop?: Loop; error?: string },
  ): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const result = apply(loop, this.host.now());
    if (!result.ok || !result.loop) return { ok: false, error: result.error };
    await this.replaceLoop(result.loop);
    return { ok: true, loop: result.loop };
  }

  /** Sets/clears the loop's user context override (prompt + skills). User-level only. */
  setLoopContext(loopId: string, overrides: ContextOverrides | null): Promise<OrchestratorActionResult> {
    return this.applyOverride(loopId, (loop, now) => ({ ok: true, loop: applyLoopContext(loop, overrides, now) }));
  }

  /** Applies a user-supplied recovery decision (manual override). */
  async chooseRecovery(loopId: string, decision: RecoveryDecision): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const applied = applyRecovery(this.host, loop, decision);
    if (applied.rejection) return { ok: false, error: applied.rejection };
    await this.replaceLoop(applied.loop);
    if (applied.loop.status === 'active' && !applied.stop) {
      return this.runNext(loopId, applied.loop);
    }
    return { ok: true, loop: applied.loop };
  }

  protected async recordRejectedRevision(loop: Loop, reason: string): Promise<void> {
    const revision: PlanRevision = {
      revision: loop.plan.revision + 1,
      previousRevision: loop.plan.revision,
      reason,
      proposedBy: loop.status === 'draft' ? 'model' : 'user',
      status: 'rejected',
      plan: loop.plan,
      createdAt: this.host.now(),
      rejectionReason: reason,
    };
    await this.replaceLoop({ ...loop, revisions: [...loop.revisions, revision] });
  }

  protected async replaceLoop(loop: Loop): Promise<void> {
    await this.host.updateState((state) => ({
      ...state,
      loops: state.loops.map((l) => (l.id === loop.id ? loop : l)),
    }));
  }
}
