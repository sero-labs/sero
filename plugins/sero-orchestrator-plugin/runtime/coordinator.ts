// The workspace coordinator — the single executor (00-architecture.md, D-01).
//
// Phase 1 scope: it owns the control plane (create/list/show/pause/resume/stop)
// and persists loop state through `host.appState`. It does NOT yet advance
// attempts — `run_next` is acknowledged but no work runs until the durable
// coordinator core (Phase 2) and execution adapters (Phase 3/4) land. Because
// only the runtime holds `host.*`, keeping every state write here preserves the
// single-executor invariant even before execution exists.

import { randomUUID } from 'node:crypto';
import type { AppRuntimeHost } from '@sero-ai/common';

import type { OrchestratorCoordinator } from '../shared/registry';
import {
  DEFAULT_LOG_POLICY,
  DEFAULT_STATE,
  DEFAULT_STOP_RULE,
  normalizeOrchestratorState,
  type CreateLoopInput,
  type LoopGoal,
  type LoopStatus,
  type OrchestratorAction,
  type OrchestratorActionResult,
  type OrchestratorState,
} from '../shared/types';

const TERMINAL: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['complete', 'stopped']);

export interface CoordinatorContext {
  host: AppRuntimeHost;
  workspaceId: string;
  workspacePath: string;
  stateFilePath: string;
}

export class WorkspaceCoordinator implements OrchestratorCoordinator {
  constructor(private readonly ctx: CoordinatorContext) {}

  async requestAction(action: OrchestratorAction): Promise<OrchestratorActionResult> {
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
        return this.runNext(action.loopId);
    }
  }

  // ── State helpers ──────────────────────────────────────────────────────────

  private async readState(): Promise<OrchestratorState> {
    const raw = await this.ctx.host.appState.read<OrchestratorState>(this.ctx.stateFilePath);
    return raw ? normalizeOrchestratorState(raw) : { ...DEFAULT_STATE };
  }

  /**
   * Apply `mutate` to the persisted state. `host.appState.update` serializes
   * writes per file. The mutator returns the loop it touched (or null) so the
   * caller can echo it back without a second read.
   */
  private async mutate(
    mutate: (state: OrchestratorState) => LoopGoal | null,
  ): Promise<LoopGoal | null> {
    let touched: LoopGoal | null = null;
    await this.ctx.host.appState.update<OrchestratorState>(this.ctx.stateFilePath, (current) => {
      const state = current ? normalizeOrchestratorState(current) : { ...DEFAULT_STATE };
      touched = mutate(state);
      return state;
    });
    return touched;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async create(input: CreateLoopInput): Promise<OrchestratorActionResult> {
    if (!input.title?.trim() || !input.goal?.trim()) {
      return { ok: false, error: 'A goal needs both a title and a goal description.' };
    }
    const loop = this.buildLoop(input);
    await this.mutate((state) => {
      state.loops.push(loop);
      return loop;
    });
    return { ok: true, loop, message: `Created goal "${loop.title}".` };
  }

  private async list(): Promise<OrchestratorActionResult> {
    const state = await this.readState();
    return { ok: true, loops: state.loops, message: `${state.loops.length} goal(s).` };
  }

  private async show(loopId: string): Promise<OrchestratorActionResult> {
    const state = await this.readState();
    const loop = state.loops.find((l) => l.id === loopId);
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
      return { loop, message: `Resumed "${loop.title}".` };
    });
  }

  private async setStatus(loopId: string, status: 'paused' | 'stopped'): Promise<OrchestratorActionResult> {
    return this.transition(loopId, (loop) => {
      if (loop.status === status) return { loop, message: `"${loop.title}" is already ${status}.` };
      if (TERMINAL.has(loop.status)) return { error: `Cannot ${verb(status)} a ${loop.status} goal.` };
      loop.status = status;
      loop.statusReason = undefined;
      return { loop, message: `${capitalize(verb(status))}d "${loop.title}".` };
    });
  }

  private async runNext(loopId: string): Promise<OrchestratorActionResult> {
    const state = await this.readState();
    const loop = state.loops.find((l) => l.id === loopId);
    if (!loop) return { ok: false, error: `No goal with id ${loopId}.` };
    // Execution is not wired yet (lands in Phase 2/3). Acknowledge without
    // advancing an attempt so callers get a truthful answer.
    return {
      ok: true,
      loop,
      message: 'Running goals is not available yet — execution lands in a later phase.',
    };
  }

  /** Shared find + mutate + persist for status transitions. */
  private async transition(
    loopId: string,
    apply: (loop: LoopGoal) => { loop?: LoopGoal; message?: string; error?: string },
  ): Promise<OrchestratorActionResult> {
    let outcome: { message?: string; error?: string } = {};
    const touched = await this.mutate((state) => {
      const loop = state.loops.find((l) => l.id === loopId);
      if (!loop) {
        outcome = { error: `No goal with id ${loopId}.` };
        return null;
      }
      const before = loop.status;
      const result = apply(loop);
      outcome = { message: result.message, error: result.error };
      if (result.error) return null;
      if (loop.status !== before) loop.updatedAt = nowIso();
      return loop;
    });
    if (outcome.error) return { ok: false, error: outcome.error };
    return { ok: true, loop: touched ?? undefined, message: outcome.message };
  }

  // ── Normalization ──────────────────────────────────────────────────────────

  private buildLoop(input: CreateLoopInput): LoopGoal {
    const now = nowIso();
    const executionMode = input.executionMode ?? 'background-worker';
    return {
      id: `loop-${randomUUID()}`,
      workspaceId: this.ctx.workspaceId,
      defaultCwd: input.defaultCwd,
      sessionId: input.sessionId,
      executionMode,
      hybridPolicy: executionMode === 'hybrid' ? input.hybridPolicy ?? 'prefer-background-worker' : input.hybridPolicy,
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

function nowIso(): string {
  return new Date().toISOString();
}

function verb(status: 'paused' | 'stopped'): string {
  return status === 'paused' ? 'pause' : 'stop';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
