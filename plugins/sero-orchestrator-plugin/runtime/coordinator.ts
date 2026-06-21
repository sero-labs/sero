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

export class Coordinator {
  constructor(protected readonly host: OrchestratorHost) {}

  async requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult> {
    switch (action.kind) {
      case 'create':
        return this.create(action.prompt, action.title, action.options);
      case 'list':
        return this.list();
      case 'show':
        return this.show(action.loopId);
      case 'activate':
        return this.transition(action.loopId, (loop) => activate(loop, this.host.now()));
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
        return this.chooseRecovery(action.loopId);
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
    const draft = buildDraftLoop(this.host, { prompt, title, options });
    await this.appendLoop(draft);
    this.host.log(`Created draft loop ${draft.id}`);
    return { ok: true, loop: draft };
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
    return { ok: true, loop };
  }

  async revise(loopId: string, _prompt?: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    return { ok: false, error: 'Revision is not available yet.' };
  }

  async chooseRecovery(loopId: string): Promise<OrchestratorActionResult> {
    const loop = await this.findLoop(loopId);
    if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
    return { ok: false, error: 'Recovery selection is not available yet.' };
  }
}
