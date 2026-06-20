// The seam between the durable coordinator core (this Phase) and execution
// adapters (background-worker → Phase 3, active-session → Phase 4).
//
// The core owns the whole attempt lifecycle — workdir, baseRef, dirty-root gate,
// budgets, checks, stop rules, transitions — and delegates exactly one step to
// an adapter: *perform the change* and report what changed at the attempt cwd
// (D-06). An adapter never touches loop state; it only runs work and returns a
// result. Until Phase 3/4 register a real adapter, `resolve` returns null and
// `run_next` reports the truthful "not yet" message.

import type { AppRuntimeHost } from '@sero-ai/common';

import type {
  AttemptExecutionMode,
  LoopAttempt,
  LoopGoal,
} from '../shared/types';
import { probeSessionAvailability, routeHybrid } from './hybrid';

/** Everything an adapter needs to perform one attempt's change. */
export interface AttemptContext {
  loop: LoopGoal;
  /** The persisted running attempt (id, workdir, baseRef, parentSessionId). */
  attempt: LoopAttempt;
  /** Canonical working directory — equals `attempt.workdir.cwd` (D-06). */
  cwd: string;
  host: AppRuntimeHost;
  workspaceId: string;
  /** Tripped on the per-attempt hard timeout or on cancellation (stop/pause). */
  signal: AbortSignal;
  /** Hard per-attempt timeout already wired to `signal`; informational. */
  timeoutMs?: number;
}

export type AttemptOutcomeStatus = 'completed' | 'aborted' | 'error';

/** What an adapter reports back after performing the change. */
export interface AttemptExecutionResult {
  status: AttemptOutcomeStatus;
  /** Files the change touched, observed at the attempt cwd (D-06). */
  changedFiles: string[];
  /** Hash of the diff; feeds no-progress detection (D-13). */
  diffFingerprint?: string;
  /** Raw worker/turn text — persisted to an artifact, never inline (D-08/D-14). */
  response?: string;
  /** Distilled worker summary (from parsed output) — feeds next-attempt context (D-08). */
  summary?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: number };
  model?: string;
  /** Active-session turn correlation id (D-05). */
  sessionTurnId?: string;
  /** Background-worker tracker correlation id (in-memory only). */
  workerRunId?: string;
  /** Failure detail when status is `error` / `aborted`. */
  error?: string;
}

/** Context for an adapter's readiness gate — runs before the attempt is created. */
export interface AttemptPreflightContext {
  loop: LoopGoal;
  host: AppRuntimeHost;
  workspaceId: string;
  workspacePath: string;
}

/**
 * The result of an adapter's readiness gate. A not-ready result DEFERS the run
 * (no attempt is created or counted) so the loop stays active and retries on its
 * next trigger — used by the active-session adapter when the target session is
 * busy (D-05), distinct from a failed attempt.
 */
export type AttemptPreflight = { ready: true } | { ready: false; reason: string };

export interface AttemptAdapter {
  readonly mode: AttemptExecutionMode;
  /**
   * Optional readiness gate, run by the core BEFORE the attempt record is
   * created (so a not-ready result defers cleanly without burning an attempt).
   * The background worker is always ready; the active-session adapter gates on
   * an idle, resolvable target session.
   */
  preflight?(ctx: AttemptPreflightContext): Promise<AttemptPreflight>;
  execute(ctx: AttemptContext): Promise<AttemptExecutionResult>;
}

/** The adapter chosen for an attempt plus, for hybrid loops, why it was chosen. */
export interface AdapterResolution {
  adapter: AttemptAdapter;
  /** Recorded on the attempt for hybrid loops (D-09); undefined for fixed modes. */
  routingReason?: string;
}

/** What the registry needs to route a `hybrid` loop (probe the live session). */
export interface ResolveContext {
  host: AppRuntimeHost;
  workspaceId: string;
}

export interface AdapterRegistry {
  /**
   * Resolve the adapter for a loop, or null when none is registered. For a
   * `hybrid` loop this picks background-worker vs active-session per the loop's
   * `HybridPolicy` and the live session state (D-09), recording the reason.
   */
  resolve(loop: LoopGoal, ctx: ResolveContext): Promise<AdapterResolution | null>;
}

/**
 * Default registry keyed by attempt execution mode. A fixed-mode loop resolves
 * straight to its adapter; a `hybrid` loop is routed per attempt (Phase 4) by
 * {@link routeHybrid} against the probed session state, with the chosen reason
 * recorded for the attempt.
 */
export class MapAdapterRegistry implements AdapterRegistry {
  private readonly byMode = new Map<AttemptExecutionMode, AttemptAdapter>();

  constructor(adapters: AttemptAdapter[] = []) {
    for (const adapter of adapters) this.byMode.set(adapter.mode, adapter);
  }

  register(adapter: AttemptAdapter): void {
    this.byMode.set(adapter.mode, adapter);
  }

  async resolve(loop: LoopGoal, ctx: ResolveContext): Promise<AdapterResolution | null> {
    if (loop.executionMode !== 'hybrid') {
      const adapter = this.byMode.get(loop.executionMode);
      return adapter ? { adapter } : null;
    }
    const session = await probeSessionAvailability(ctx.host, ctx.workspaceId);
    const route = routeHybrid({
      policy: loop.hybridPolicy ?? 'prefer-background-worker',
      session,
      // Worktree isolation forces the background worker — an active session can't
      // be repointed at a worktree (D-06). Once a loop has isolated (configured or
      // via the dirty-root gate) every later attempt routes to the worker.
      useWorktree: loop.isolation === 'worktree' || loop.worktree !== undefined,
    });
    const adapter = this.byMode.get(route.mode);
    return adapter ? { adapter, routingReason: route.reason } : null;
  }
}
