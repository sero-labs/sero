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
  CreateLoopOptions,
  Loop,
  OrchestratorAction,
  OrchestratorActionResult,
  OrchestratorState,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/defaults';
import type { OrchestratorHost } from './host';
import { buildDraftLoop } from './loop-factory';
import { activate, pause, resume, stop, type TransitionResult } from './lifecycle';
import { planLoop } from './planner';
import { applyPlanningResponse, planIsActivatable } from './plan-mapping';
import { RunEngine } from './run-engine';
import type { EngineDeps } from './engine-types';
import { reconcileAll } from './reconcile';
import { applyRecovery } from './recovery-apply';
import { proposeRevisedPlan } from './llm-decisions';
import { validateLoopPlan } from './schema';
import { evaluateCronTriggers, fireEventTriggers } from './scheduler';
import type { PlanRevision, RecoveryDecision } from '../shared/types';

export class Coordinator {
  protected readonly engine?: RunEngine;

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
      const { loop: updated, due } = evaluateCronTriggers(loop, nowMs);
      if (updated !== loop) await this.replaceLoop(updated);
      if (due) dueLoopIds.push(loop.id);
    }
    for (const loopId of dueLoopIds) await this.runNext(loopId);
  }

  /** Fires event/hybrid triggers for a loop and runs it if newly due. */
  async fireEvent(loopId: string, eventSource: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const { loop: updated, due } = fireEventTriggers(loop, eventSource, Date.parse(this.host.now()));
    await this.replaceLoop(updated);
    if (due && updated.status === 'active') return this.runNext(loopId, updated);
    return { ok: true, loop: updated };
  }

  async requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult> {
    switch (action.kind) {
      case 'create':
        return this.create(action.prompt, action.title, action.options);
      case 'list':
        return this.list();
      case 'show':
        return this.show(action.loopId);
      case 'activate':
        return this.activateLoop(action.loopId);
      case 'pause':
        return this.transition(action.loopId, (loop) => pause(loop, this.host.now()));
      case 'resume':
        return this.transition(action.loopId, (loop) => resume(loop, this.host.now()));
      case 'stop':
        return this.transition(action.loopId, (loop) => stop(loop, this.host.now()));
      case 'run_next':
        return this.runNext(action.loopId);
      case 'revise':
        return this.revise(action.loopId, action.prompt);
      case 'choose_recovery':
        return this.chooseRecovery(action.loopId, action.decision);
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
    // Build the draft first so we have a stable id and parentSessionId for the
    // planning model call.
    const draft = buildDraftLoop(this.host, { prompt, title, options });

    const outcome = await planLoop(this.host, {
      prompt,
      parentSessionId: draft.runtime.parentSessionId,
    });

    let loop: Loop;
    if (outcome.ok) {
      loop = applyPlanningResponse(this.host, draft, outcome.response, options, title);
      this.host.log(`Created loop ${loop.id} with ${loop.plan.steps.length} step(s)`);
    } else {
      // Store an invalid plan as a blocked draft with clear validation errors.
      // Retain the raw model reply so the failure is diagnosable, not a black box.
      const rawRef = outcome.modelResponses.length
        ? await this.host.writeArtifact(
            `planner/${draft.id}.txt`,
            outcome.modelResponses.join('\n\n--- next attempt ---\n\n'),
          )
        : undefined;
      const reason = rawRef
        ? `${outcome.errors.join('; ')} — raw model reply saved to ${rawRef}`
        : outcome.errors.join('; ');
      loop = {
        ...draft,
        summary: 'Plan generation failed validation.',
        runtime: {
          ...draft.runtime,
          block: { kind: 'validation-error', reason, createdAt: this.host.now() },
        },
      };
      this.host.log(`Created blocked draft ${loop.id}: ${reason}`);
    }

    await this.appendLoop(loop);

    if (outcome.ok && options?.activate) {
      return this.activateLoop(loop.id);
    }
    return { ok: true, loop };
  }

  /** Activates a draft only after confirming its plan is structurally valid. */
  async activateLoop(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    const gate = planIsActivatable(loop);
    if (!gate.ok) return { ok: false, error: gate.error };
    return this.transition(loopId, (current) => activate(current, this.host.now()));
  }

  protected async appendLoop(loop: Loop): Promise<void> {
    await this.host.updateState((state) => ({ ...state, loops: [...state.loops, loop] }));
  }

  // ── Lifecycle transitions ─────────────────────────────────

  protected async transition(
    loopId: string,
    apply: (loop: Loop) => TransitionResult,
  ): Promise<OrchestratorActionResult> {
    const result = await this.mutateLoop(loopId, apply);
    if (!result.ok) return result;
    // Activating/resuming may make the loop immediately runnable.
    if (result.loop && result.loop.status === 'active') {
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
  async runNext(loopId: string, known?: Loop): Promise<OrchestratorActionResult> {
    const loop = known ?? (await this.findLoop(loopId));
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    if (loop.status !== 'active') {
      return { ok: false, error: `Loop ${loopId} is "${loop.status}", not active.` };
    }
    if (!this.engine) return { ok: true, loop };
    const result = await this.engine.run(loopId);
    const updated = await this.findLoop(loopId);
    return { ok: true, loop: updated, run: result.run };
  }

  /** Manual plan revision: ask the LLM for a revised plan, validate, and apply. */
  async revise(loopId: string, prompt?: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };

    const proposal = await proposeRevisedPlan(this.host, loop, prompt);
    if (proposal.error || !proposal.plan) {
      await this.recordRejectedRevision(loop, proposal.error ?? 'no plan returned');
      return { ok: false, error: proposal.error ?? 'Revision failed.' };
    }
    const errors = validateLoopPlan(proposal.plan);
    if (errors.length > 0) {
      await this.recordRejectedRevision(loop, errors.join('; '));
      return { ok: false, error: `Revised plan invalid: ${errors.join('; ')}` };
    }

    const decision: RecoveryDecision = {
      id: this.host.newId('recovery'),
      stepId: loop.plan.steps[0]?.id ?? '',
      failedAttemptId: '',
      decision: 'revise-plan',
      reason: prompt ?? 'manual revision',
      revisedPlan: proposal.plan,
      createdAt: this.host.now(),
      modelResponsePath: proposal.modelResponsePath,
    };
    const applied = applyRecovery(this.host, loop, decision);
    if (applied.rejection) {
      await this.recordRejectedRevision(loop, applied.rejection);
      return { ok: false, error: applied.rejection };
    }
    await this.replaceLoop(applied.loop);
    return { ok: true, loop: applied.loop };
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
