// The workspace coordinator — the single executor (00-architecture.md, D-01).
//
// Phase 1 scope: it owns the control plane (create/list/show/pause/resume/stop)
// and persists loop state through `host.appState`. It does NOT yet advance
// attempts — `run_next` is acknowledged but no work runs until the durable
// coordinator core (Phase 2) and execution adapters (Phase 3/4) land. Because
// only the runtime holds `host.*`, keeping every state write here preserves the
// single-executor invariant even before execution exists.

import { randomUUID } from 'node:crypto';
import type { AppRuntimeHost, TurnCompletion } from '@sero-ai/common';

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

// How long to wait for the diagnostic turn to complete before reporting it as
// unobserved. A real turn can take a while; the timer is cleared on completion.
const DIAGNOSTIC_TURN_TIMEOUT_MS = 60_000;

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
      case 'diagnose_session':
        return this.diagnoseSession();
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

  // ── Session seam spike (Phase 1.5) ───────────────────────────────────────────

  /**
   * Prove the active-session host seam (specs/02 §New seam): resolve the
   * workspace's live session, read idle/pending, send a no-op diagnostic only
   * when it is safe (idle + no pending), and observe that turn's completion
   * correlated by `turnId`. Read-only with respect to loop state — it never
   * touches an attempt or a goal. CLI-only proof surface; not in the UI.
   */
  private async diagnoseSession(): Promise<OrchestratorActionResult> {
    const { session } = this.ctx.host;
    const active = await session.getActiveForWorkspace(this.ctx.workspaceId);
    if (!active) {
      return { ok: true, message: 'No active session in this workspace to diagnose.' };
    }

    const state = await session.getState(active.sessionId);
    if (!state.idle || state.pendingMessages > 0) {
      const reason = !state.idle ? 'a turn is in progress' : `${state.pendingMessages} message(s) pending`;
      return {
        ok: true,
        message: `Deferred: session ${active.sessionId} is busy (${reason}). No message sent.`,
      };
    }

    // Subscribe before sending so a fast turn cannot complete unobserved.
    const completion = this.observeNextTurn(active.sessionId);
    const { turnId } = await session.sendContextMessage(
      active.sessionId,
      {
        customType: 'orchestrator-diagnostic',
        content: 'Orchestrator session diagnostic — reply with a one-line acknowledgement.',
        display: false,
      },
      { deliverAs: 'nextTurn', triggerTurn: true, source: 'orchestrator' },
    );

    if (!turnId) {
      return { ok: false, error: 'Diagnostic delivered but no turn id was returned.' };
    }

    const result = await completion;
    if (!result) {
      return {
        ok: true,
        message: `Diagnostic turn ${turnId} sent to ${active.sessionId}; completion not observed within the window.`,
      };
    }

    const correlation = result.turnId === turnId ? 'matched' : `MISMATCH (observed ${result.turnId})`;
    return {
      ok: true,
      message: `Diagnostic ok — session ${active.sessionId}, turn ${turnId} ${result.status}, correlation ${correlation}.`,
    };
  }

  /** Resolve with the next observed turn completion, or null after a timeout. */
  private observeNextTurn(sessionId: string): Promise<TurnCompletion | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: TurnCompletion | null) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        clearTimeout(timer);
        resolve(value);
      };
      const unsubscribe = this.ctx.host.session.onTurnComplete(sessionId, (c) => finish(c));
      const timer = setTimeout(() => finish(null), DIAGNOSTIC_TURN_TIMEOUT_MS);
    });
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
