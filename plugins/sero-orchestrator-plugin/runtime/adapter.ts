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
  ExecutionMode,
  LoopAttempt,
  LoopGoal,
} from '../shared/types';

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
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  model?: string;
  /** Active-session turn correlation id (D-05). */
  sessionTurnId?: string;
  /** Background-worker tracker correlation id (in-memory only). */
  workerRunId?: string;
  /** Failure detail when status is `error` / `aborted`. */
  error?: string;
}

export interface AttemptAdapter {
  readonly mode: AttemptExecutionMode;
  execute(ctx: AttemptContext): Promise<AttemptExecutionResult>;
}

export interface AdapterRegistry {
  /** Resolve the adapter for a loop's execution mode, or null when none exists. */
  resolve(mode: ExecutionMode, loop: LoopGoal): AttemptAdapter | null;
}

/**
 * Default registry keyed by attempt execution mode. Hybrid routing (per-attempt
 * choice via `HybridPolicy`) lands in Phase 4, so `hybrid` resolves to null for
 * now — the loop reports "not yet" rather than guessing an adapter.
 */
export class MapAdapterRegistry implements AdapterRegistry {
  private readonly byMode = new Map<AttemptExecutionMode, AttemptAdapter>();

  constructor(adapters: AttemptAdapter[] = []) {
    for (const adapter of adapters) this.byMode.set(adapter.mode, adapter);
  }

  register(adapter: AttemptAdapter): void {
    this.byMode.set(adapter.mode, adapter);
  }

  resolve(mode: ExecutionMode, _loop: LoopGoal): AttemptAdapter | null {
    if (mode === 'hybrid') return null;
    return this.byMode.get(mode) ?? null;
  }
}
